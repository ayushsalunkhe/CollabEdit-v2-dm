"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Plus, LogIn, ExternalLink, Settings } from "lucide-react"
import { getFirebaseSafe, ensureAnonUser, createInitialSession } from "@/lib/firebase"

export default function HomePage() {
  const router = useRouter()
  const [joinId, setJoinId] = useState("")
  const [firebaseReady, setFirebaseReady] = useState(false)

  useEffect(() => {
    // Try load firebase config (env or localStorage). If not present, show setup card.
    const ready = getFirebaseSafe() !== null
    setFirebaseReady(ready)
  }, [])

  async function handleCreate() {
    const fb = getFirebaseSafe()
    if (!fb) return alert("Please configure Firebase first.")
    await ensureAnonUser()
    const sessionId = await createInitialSession()
    router.push(`/session/${sessionId}`)
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    if (!joinId.trim()) return
    router.push(`/session/${encodeURIComponent(joinId.trim())}`)
  }

  return (
    <main className="min-h-[100dvh] bg-muted/40 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Start a new session</CardTitle>
            <CardDescription>Create a collaborative coding room and share the link.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button onClick={handleCreate} className="gap-2" size="lg">
              <Plus className="h-4 w-4" />
              New Session
            </Button>
            {!firebaseReady && (
              <div className="text-sm text-muted-foreground">
                Firebase not configured. Click "Setup Firebase" to paste your client config.
              </div>
            )}
            <Link
              href="https://vercel.com"
              target="_blank"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              Deploy on Vercel <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Join a session</CardTitle>
            <CardDescription>Paste a session ID from a shared link.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="sessionId">Session ID</Label>
                <Input
                  id="sessionId"
                  placeholder="e.g. 0b8f9dbb-..."
                  value={joinId}
                  onChange={(e) => setJoinId(e.target.value)}
                />
              </div>
              <Button type="submit" className="gap-2">
                <LogIn className="h-4 w-4" />
                Join
              </Button>
            </form>
            <div className="mt-6">
              <FirebaseSetup />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function FirebaseSetup() {
  const [show, setShow] = useState(false)
  const [raw, setRaw] = useState("")
  const [usingEnv, setUsingEnv] = useState(false)

  useEffect(() => {
    // determine if env vars exist
    const hasEnv =
      typeof process !== "undefined" &&
      !!process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
      !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    setUsingEnv(!!hasEnv)
    if (!hasEnv) {
      const saved = typeof window !== "undefined" ? window.localStorage.getItem("firebaseConfig") : null
      if (saved) {
        setRaw(saved)
      } else {
        setRaw(
          JSON.stringify(
            {
              apiKey: "YOUR_API_KEY",
              authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
              projectId: "YOUR_PROJECT_ID",
              storageBucket: "YOUR_PROJECT_ID.appspot.com",
              messagingSenderId: "YOUR_SENDER_ID",
              appId: "YOUR_APP_ID",
            },
            null,
            2,
          ),
        )
      }
    }
  }, [])

  if (usingEnv) {
    return (
      <div className="text-sm text-muted-foreground">
        Firebase is configured via environment variables. You&apos;re good to go.
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <Button variant="outline" className="gap-2 bg-transparent" onClick={() => setShow((s) => !s)}>
        <Settings className="h-4 w-4" />
        {show ? "Hide Firebase Setup" : "Setup Firebase"}
      </Button>
      {show && (
        <>
          <p className="text-sm text-muted-foreground">
            Paste your Firebase Web App config JSON (from Firebase Console &gt; Project Settings &gt; SDK setup &amp;
            config). It will be stored in your browser only (localStorage).
          </p>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            className="w-full h-48 rounded-md border bg-background p-3 text-sm font-mono"
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                try {
                  const parsed = JSON.parse(raw)
                  if (!parsed.apiKey || !parsed.projectId) {
                    alert("Config must include apiKey and projectId.")
                    return
                  }
                  window.localStorage.setItem("firebaseConfig", JSON.stringify(parsed))
                  alert("Saved. Reloading...")
                  window.location.reload()
                } catch {
                  alert("Invalid JSON.")
                }
              }}
            >
              Save config
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                window.localStorage.removeItem("firebaseConfig")
                alert("Removed local config. Reloading...")
                window.location.reload()
              }}
            >
              Clear
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
