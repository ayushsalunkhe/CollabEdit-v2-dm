"use client"

import dynamic from "next/dynamic"
import { useCallback } from "react"

// Dynamic import to avoid SSR issues
const Monaco = dynamic(() => import("@monaco-editor/react"), { ssr: false })

export function EditorPane({
  value = "",
  language = "javascript",
  onChange = () => {},
}: {
  value?: string
  language?: string
  onChange?: (val: string) => void
}) {
  const handleChange = useCallback((v?: string) => onChange(v ?? ""), [onChange])

  // Editor height fills available space
  return (
    <div className="flex-1 min-h-0">
      <Monaco
        height="100%"
        defaultLanguage={language}
        language={language}
        theme="vs-dark"
        value={value}
        onChange={handleChange}
        options={{
          fontSize: 14,
          minimap: { enabled: false },
          automaticLayout: true,
          scrollBeyondLastLine: false,
        }}
      />
    </div>
  )
}
