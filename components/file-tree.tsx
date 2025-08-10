"use client"

import { cn } from "@/lib/utils"

export function FileTree({
  files = { "main.js": "" },
  activeFile = "main.js",
  onSelect = () => {},
}: {
  files?: Record<string, string>
  activeFile?: string
  onSelect?: (name: string) => void
}) {
  const names = Object.keys(files)
  return (
    <ul className="text-sm">
      {names.map((name) => (
        <li key={name}>
          <button
            className={cn(
              "w-full px-3 py-1.5 text-left hover:bg-muted/60",
              activeFile === name && "bg-muted font-medium",
            )}
            onClick={() => onSelect(name)}
          >
            {name}
          </button>
        </li>
      ))}
      {!names.length && <li className="px-3 py-2 text-muted-foreground">No files</li>}
    </ul>
  )
}
