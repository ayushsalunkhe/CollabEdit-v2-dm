"use client"

import { useEffect, useState } from "react"
import { initializeApp, getApps, type FirebaseApp } from "firebase/app"
import {
  initializeFirestore,
  type Firestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  collection,
  deleteDoc,
  enableIndexedDbPersistence,
  FieldPath,
  type DocumentData,
} from "firebase/firestore"
import { getAuth, signInAnonymously, type Auth } from "firebase/auth"

let app: FirebaseApp | null = null
let db: Firestore | null = null
let auth: Auth | null = null
let persistenceTried = false

function readConfigFromEnvOrLocal(): Record<string, string> | null {
  const envApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const envProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (envApiKey && envProjectId) {
    return {
      apiKey: envApiKey,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${envProjectId}.firebaseapp.com`,
      projectId: envProjectId,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${envProjectId}.appspot.com`,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
    }
  }
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem("firebaseConfig")
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed.apiKey && parsed.projectId) return parsed
      } catch {}
    }
  }
  return null
}

async function tryEnablePersistence(firestore: Firestore) {
  if (persistenceTried) return
  persistenceTried = true
  try {
    await enableIndexedDbPersistence(firestore)
  } catch {
    // Ignore; app still works without offline cache
  }
}

function ensureInit() {
  if (app && db && auth) return
  const config = readConfigFromEnvOrLocal()
  if (!config) return
  if (!getApps().length) {
    app = initializeApp(config)
  } else {
    app = getApps()[0]!
  }
  db = initializeFirestore(app!, {
    experimentalAutoDetectLongPolling: true,
    useFetchStreams: false,
  })
  void tryEnablePersistence(db)
  auth = getAuth(app!)
}

function getSyntheticUid(): string {
  try {
    if (typeof window !== "undefined") {
      const key = "syntheticUid"
      let id = window.localStorage.getItem(key)
      if (!id) {
        id =
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : Math.random().toString(36).slice(2)
        window.localStorage.setItem(key, id)
      }
      return id
    }
  } catch {}
  return "local-" + Math.random().toString(36).slice(2)
}

export async function ensureAnonUser(): Promise<{ uid: string; provider: "firebase" | "synthetic" }> {
  ensureInit()
  if (!auth) throw new Error("Firebase not initialized")
  if (auth.currentUser) {
    return { uid: auth.currentUser.uid, provider: "firebase" }
  }
  try {
    const res = await signInAnonymously(auth)
    return { uid: res.user.uid, provider: "firebase" }
  } catch (err: any) {
    const code = err?.code || err?.message || ""
    const known = ["auth/configuration-not-found", "auth/operation-not-allowed", "auth/unauthorized-domain"]
    if (known.some((k) => String(code).includes(k))) {
      const uid = getSyntheticUid()
      return { uid, provider: "synthetic" }
    }
    throw err
  }
}

export function getFirebaseSafe() {
  ensureInit()
  return app && db && auth ? { app, db, auth } : null
}

export function getDb() {
  ensureInit()
  if (!db) throw new Error("Firebase not initialized")
  return db
}

export async function createInitialSession(): Promise<string> {
  const db = getDb()
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  await setDoc(doc(db, "sessions", id), {
    createdAt: Date.now(),
    files: {
      "main.js": "// Start coding...\nconsole.log('Hello from session: " + id.slice(0, 8) + "')",
      "index.html":
        "<!doctype html>\n<html>\n  <head><title>Preview</title></head>\n  <body><h1>Hello</h1></body>\n</html>",
    },
    output: "",
    participants: [],
  })
  return id
}

export function getSessionDocRef(sessionId: string) {
  const db = getDb()
  return doc(db, "sessions", sessionId)
}

// Use FieldPath to update filenames with dots safely
export async function updateFileContent(sessionId: string, filename: string, code: string) {
  const db = getDb()
  const ref = doc(db, "sessions", sessionId)
  await updateDoc(ref, new FieldPath("files", filename), code)
}

export async function addFile(sessionId: string, filename: string, initial = "// New file") {
  const db = getDb()
  const ref = doc(db, "sessions", sessionId)
  await updateDoc(ref, new FieldPath("files", filename), initial)
}

export async function updateOutput(sessionId: string, text: string) {
  const db = getDb()
  await updateDoc(doc(db, "sessions", sessionId), {
    output: text,
  })
}

// Flatten nested maps like { main: { js: "..." } } into { "main.js": "..." }
function flattenFilesMap(input: any): Record<string, string> {
  const out: Record<string, string> = {}
  function walk(node: any, prefix: string[]) {
    if (typeof node === "string") {
      const name = prefix.join(".")
      out[name] = node
      return
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        walk(v as DocumentData, [...prefix, k])
      }
    }
  }
  if (input && typeof input === "object") {
    for (const [k, v] of Object.entries(input)) {
      walk(v as DocumentData, [k])
    }
  }
  return out
}

export async function joinSessionStream(
  sessionId: string,
  onData: (data: { files?: Record<string, string>; output?: string }) => void,
) {
  const db = getDb()
  const ref = doc(db, "sessions", sessionId)

  // Ensure session exists (best-effort)
  try {
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        createdAt: Date.now(),
        files: { "main.js": "// Start coding..." },
        output: "",
        participants: [],
      })
    }
  } catch {
    // offline or permission issue; the listener below will catch up later
  }

  const u = await ensureAnonUser()
  const uid = u.uid
  const presenceRef = doc(db, "sessions", sessionId, "participants", uid)
  try {
    await setDoc(
      presenceRef,
      {
        uid,
        joinedAt: serverTimestamp(),
        lastActive: serverTimestamp(),
        name:
          (typeof window !== "undefined" && window.localStorage.getItem("displayName")) || `Guest-${uid.slice(0, 5)}`,
      },
      { merge: true },
    )
  } catch {}

  const beforeUnload = async () => {
    try {
      await deleteDoc(presenceRef)
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", beforeUnload)
  }

  const interval = setInterval(async () => {
    try {
      await setDoc(
        presenceRef,
        {
          lastActive: serverTimestamp(),
        },
        { merge: true },
      )
    } catch {}
  }, 20000)

  let isNormalizing = false

  const unsub = onSnapshot(
    ref,
    async (d) => {
      const data = d.data() as any
      let files = (data?.files as any) || {}
      // Detect nested structure and normalize it
      const flattened = flattenFilesMap(files)
      const needsNormalize =
        Object.keys(flattened).length > 0 &&
        // if any top-level value is an object, it's a sign of incorrect nested map
        Object.values(files).some((v: any) => v && typeof v === "object")

      if (needsNormalize && !isNormalizing) {
        try {
          isNormalizing = true
          await setDoc(ref, { files: flattened }, { merge: true })
          files = flattened
        } catch {
          // ignore; try again next snapshot
        } finally {
          isNormalizing = false
        }
      }

      onData({ files: files as Record<string, string>, output: data?.output })
    },
    () => {
      // silent error; Firestore will retry
    },
  )

  return () => {
    clearInterval(interval)
    if (typeof window !== "undefined") {
      window.removeEventListener("beforeunload", beforeUnload)
    }
    unsub()
    deleteDoc(presenceRef).catch(() => {})
  }
}

export function useParticipants(sessionId: string) {
  const [list, setList] = useState<{ uid: string; name: string }[]>([])
  useEffect(() => {
    if (!sessionId) return
    const db = getDb()
    const c = collection(db, "sessions", sessionId, "participants")
    const unsub = onSnapshot(
      c,
      (snap) => {
        setList(snap.docs.map((d) => d.data() as any))
      },
      () => {},
    )
    return () => unsub()
  }, [sessionId])
  return list
}
