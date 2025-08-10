"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getDb, ensureAnonUser } from "@/lib/firebase"
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp, type DocumentData } from "firebase/firestore"

type Message = {
  id: string
  user: string
  text: string
  createdAt?: any
}

export function Chat({ sessionId = "" }: { sessionId?: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState("")
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId) return
    const db = getDb()
    const q = query(collection(db, "sessions", sessionId, "messages"), orderBy("createdAt", "asc"))
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...(d.data() as DocumentData) })) as Message[]
      setMessages(data)
      setTimeout(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" })
      }, 10)
    })
    return () => unsub()
  }, [sessionId])

  async function send() {
    const t = text.trim()
    if (!t) return
    await ensureAnonUser()
    const name = (typeof window !== "undefined" && window.localStorage.getItem("displayName")) || "Anonymous"
    const db = getDb()
    await addDoc(collection(db, "sessions", sessionId, "messages"), {
      user: name,
      text: t,
      createdAt: serverTimestamp(),
    })
    setText("")
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div ref={listRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.map((m) => (
          <div key={m.id} className="text-sm">
            <span className="font-medium">{m.user}</span>
            <span className="text-muted-foreground">:</span> {m.text}
          </div>
        ))}
        {!messages.length && <div className="text-sm text-muted-foreground">No messages yet. Say hello!</div>}
      </div>
      <div className="border-t p-2 flex items-center gap-2">
        <Input
          placeholder="Message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button onClick={send}>Send</Button>
      </div>
    </div>
  )
}
