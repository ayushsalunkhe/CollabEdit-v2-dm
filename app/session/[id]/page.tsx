"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Copy, Play, Users, FileCode, Plus, Terminal, LinkIcon } from "lucide-react"
import {
  getFirebaseSafe,
  ensureAnonUser,
  joinSessionStream,
  updateFileContent,
  addFile,
  useParticipants,
  updateOutput,
} from "@/lib/firebase"
import { EditorPane } from "@/components/editor"
// import { Chat } from "@/components/chat"
import { FileTree } from "@/components/file-tree"
import Link from "next/link"

type FilesMap = Record<string, string>

export default function SessionPage() {
  const params = useParams<{ id: string }>()
  const sessionId = params?.id
  const [files, setFiles] = useState<FilesMap>({ "main.js": "// Start coding...\nconsole.log('Hello from session');" })
  const [activeFile, setActiveFile] = useState<string>("main.js")
  const [output, setOutput] = useState<string>("")
  const [languageId, setLanguageId] = useState<number>(63) // JavaScript (Node.js) default for Judge0 (may vary by instance)
  const [linkCopied, setLinkCopied] = useState(false)
  const [idCopied, setIdCopied] = useState(false)

  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isRemoteApplying = useRef(false)
  const participants = useParticipants(String(sessionId))

  useEffect(() => {
    const fb = getFirebaseSafe()
    if (!fb) {
      setError("Firebase is not configured. Go back and set it up on the home page.")
      return
    }
    setReady(true)
  }, [])

  useEffect(() => {
    if (!ready || !sessionId) return
    ;(async () => {
      try {
        await ensureAnonUser()
        const unsub = await joinSessionStream(String(sessionId), (data) => {
          // Apply remote changes
          isRemoteApplying.current = true
          if (data.files) setFiles(data.files)
          if (typeof data.output === "string") setOutput(data.output)
          if (data.files && !data.files[activeFile]) {
            const first = Object.keys(data.files)[0]
            setActiveFile(first || "main.js")
          }
          setTimeout(() => (isRemoteApplying.current = false), 0)
        })
        return () => unsub && unsub()
      } catch (e: any) {
        setError(e?.message ?? "Failed to join session")
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sessionId])

  async function handleChange(code: string) {
    const current = activeFile
    setFiles((prev) => ({ ...prev, [current]: code }))
    // Avoid infinite loop: Firestore onSnapshot will bring the same text back
    if (isRemoteApplying.current) return
    try {
      await updateFileContent(String(sessionId), current, code)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleAddFile() {
    const name = prompt('New file name (e.g. "index.html" or "utils.js")')
    if (!name) return
    if (files[name]) return alert("File already exists.")
    try {
      await addFile(String(sessionId), name, "// New file")
      setActiveFile(name)
    } catch (e) {
      console.error(e)
    }
  }

  async function handleRun() {
    const source = files[activeFile] ?? ""
    // Proxy to our API route (requires JUDGE0_API_KEY on the server)
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_code: source,
          language_id: languageId,
        }),
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || "Run error")
      }
      const data = await res.json()
      const out =
        (data.stdout || "") +
        (data.stderr ? "\n[stderr]\n" + data.stderr : "") +
        (data.compile_output ? "\n[compile]\n" + data.compile_output : "")
      setOutput(out || "(no output)")
      await updateOutput(String(sessionId), out || "")
    } catch (e: any) {
      const msg =
        "Code execution failed. Set JUDGE0_API_KEY on the server (Vercel) or try again.\n\n" + (e?.message ?? String(e))
      setOutput(msg)
      try {
        await updateOutput(String(sessionId), msg)
      } catch {}
    }
  }

  const shareUrl = useMemo(() => {
    if (typeof window === "undefined") return ""
    return `${window.location.origin}/session/${sessionId}`
  }, [sessionId])

  if (error) {
    return (
      <main className="p-6">
        <Card>
          <CardContent className="p-6">
            <p className="text-destructive">{error}</p>
            <div className="mt-4">
              <Link href="/" className="underline">
                Go back
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="h-[100dvh] flex flex-col">
      <header className="h-14 border-b px-4 flex items-center gap-2">
        <div className="font-semibold">Online IDE</div>
        <Badge variant="secondary" className="ml-2">
          Session {String(sessionId).slice(0, 8)}...
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={async () => {
              if (!shareUrl) return
              await navigator.clipboard.writeText(shareUrl)
              setLinkCopied(true)
              setTimeout(() => setLinkCopied(false), 1500)
            }}
          >
            <Copy className="h-4 w-4" />
            {linkCopied ? "Copied" : "Copy Link"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-transparent"
            onClick={async () => {
              if (!sessionId) return
              await navigator.clipboard.writeText(String(sessionId))
              setIdCopied(true)
              setTimeout(() => setIdCopied(false), 1500)
            }}
          >
            <Copy className="h-4 w-4" />
            {idCopied ? "Copied" : "Copy ID"}
          </Button>
          <div className="inline-flex items-center gap-1 text-sm text-muted-foreground px-2">
            <Users className="h-4 w-4" /> {participants.length} online
          </div>
        </div>
      </header>

      <div className="flex-1 grid grid-rows-[auto_1fr]">
        <div className="border-b px-4 py-2 flex items-center gap-2">
          <Button variant="secondary" size="sm" className="gap-2" onClick={handleAddFile}>
            <Plus className="h-4 w-4" />
            Add file
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <FileLanguageSelect value={languageId} onChange={(v) => setLanguageId(v)} />
            <Button size="sm" className="gap-2" onClick={handleRun}>
              <Play className="h-4 w-4" />
              Run
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-[220px_1fr_360px] md:grid-cols-[200px_1fr] grid-cols-1 gap-0 h-full">
          <aside className="border-r overflow-y-auto">
            <div className="p-3 font-medium text-sm flex items-center gap-2">
              <FileCode className="h-4 w-4" />
              Files
            </div>
            <FileTree files={files} activeFile={activeFile} onSelect={setActiveFile} />
          </aside>

          <section className="min-w-0 flex flex-col">
            <EditorPane
              key={activeFile}
              value={files[activeFile] ?? ""}
              language={guessLanguageFromFilename(activeFile)}
              onChange={handleChange}
            />
            <div className="border-t h-[180px]">
              <Tabs defaultValue="output" className="h-full flex flex-col">
                <TabsList className="px-2">
                  <TabsTrigger value="output" className="gap-1">
                    <Terminal className="h-4 w-4" /> Output
                  </TabsTrigger>
                  <TabsTrigger value="share" className="gap-1">
                    <LinkIcon className="h-4 w-4" /> Share
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="output" className="flex-1 overflow-auto p-3">
                  <pre className="text-xs whitespace-pre-wrap font-mono">{output || "Run code to see output..."}</pre>
                </TabsContent>
                <TabsContent value="share" className="p-3">
                  <div className="text-sm">
                    Share this link with collaborators:
                    <div className="mt-2 flex gap-2">
                      <Input readOnly value={shareUrl} />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          await navigator.clipboard.writeText(shareUrl)
                          setLinkCopied(true)
                          setTimeout(() => setLinkCopied(false), 1500)
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </section>

          {/* Comment out entire chat aside section
          <aside className="border-l hidden lg:flex flex-col min-w-0">
            <div className="p-3 font-medium text-sm flex items-center gap-2 border-b">
              <MessageSquare className="h-4 w-4" />
              Chat
            </div>
            <Chat sessionId={String(sessionId)} />
          </aside>
          */}
        </div>
      </div>
    </main>
  )
}

function FileLanguageSelect({
  value = 63,
  onChange = () => {},
}: {
  value?: number
  onChange?: (v: number) => void
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Language</label>
      <select
        className="h-9 rounded-md border bg-background px-2 text-sm"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        <option value={63}>JavaScript (Node.js)</option>
        <option value={71}>Python (3.x)</option>
        <option value={54}>C# (Mono)</option>
        <option value={51}>C# (NET Core)</option>
        <option value={52}>C++ (GCC)</option>
        <option value={62}>Java (OpenJDK)</option>
      </select>
    </div>
  )
}

function guessLanguageFromFilename(file: string): string {
  const f = file.toLowerCase()
  if (f.endsWith(".ts")) return "typescript"
  if (f.endsWith(".tsx")) return "typescript"
  if (f.endsWith(".js")) return "javascript"
  if (f.endsWith(".jsx")) return "javascript"
  if (f.endsWith(".json")) return "json"
  if (f.endsWith(".css")) return "css"
  if (f.endsWith(".html")) return "html"
  if (f.endsWith(".md")) return "markdown"
  return "javascript"
}
