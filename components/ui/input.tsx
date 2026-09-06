"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Repo-token adaptation of the shadcn/ui Input: dark tokens, hairline border,
// accent focus ring. Fields never animate (DESIGN.md §4) — no transitions.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full rounded-[10px] border border-border bg-bg-base px-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
        className
      )}
      {...props}
    />
  )
}

export { Input }
