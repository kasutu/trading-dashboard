import * as React from "react"
import { Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createMistake, createSetup, updateMistake, updateSetup, useJournalTags } from "@/hooks/use-api"
import type { MistakeGroup, MistakeTag, Setup } from "@/lib/api/types"
import { MISTAKE_GROUPS, NAME_MAX } from "@/lib/journal"
import { cn } from "@/lib/utils"

type Tag = Setup | MistakeTag
type Rename = (id: string, patch: { name?: string; archived?: boolean }) => Promise<unknown>

/** Settings: your setups. Add, rename, archive. Shared by all your trading accounts. */
export function SetupSettings() {
  const { data, error } = useJournalTags()
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="setups-title">
      <div className="space-y-1">
        <h3 id="setups-title" className="text-sm font-medium">Setups</h3>
        <p className="text-sm text-muted-foreground">The trades you look for. Shared by all your trading accounts.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && <TagList tags={data.setups} update={updateSetup} empty="No setups yet." />}
      <AddForm label="New setup" placeholder="Like “Pullback to EMA”" onAdd={(name) => createSetup(name)} />
    </section>
  )
}

/** Settings: your mistake tags, in their groups. Presets can be renamed and archived, not deleted. */
export function MistakeSettings() {
  const { data, error } = useJournalTags()
  const [group, setGroup] = React.useState<MistakeGroup>("entry")
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-labelledby="mistakes-title">
      <div className="space-y-1">
        <h3 id="mistakes-title" className="text-sm font-medium">Mistake tags</h3>
        <p className="text-sm text-muted-foreground">What can go wrong in a trade. Archive the ones you never use.</p>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {data && (
        <div className="space-y-3">
          {MISTAKE_GROUPS.map((g) => (
            <div key={g.value}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{g.label}</p>
              <TagList tags={data.mistakes.filter((m) => m.group === g.value)} update={updateMistake} empty="None." />
            </div>
          ))}
        </div>
      )}
      <AddForm
        label="New mistake tag"
        placeholder="Like “Ignored my stop”"
        onAdd={(name) => createMistake(name, group)}
        extra={
          <Select value={group} onValueChange={(v) => setGroup(v as MistakeGroup)}>
            <SelectTrigger size="sm" className="w-32 shrink-0 bg-card" aria-label="Group"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MISTAKE_GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
    </section>
  )
}

function TagList({ tags, update, empty }: { tags: Tag[]; update: Rename; empty: string }) {
  const [showArchived, setShowArchived] = React.useState(false)
  const active = tags.filter((t) => !t.archived)
  const archived = tags.filter((t) => t.archived)
  return (
    <div>
      {active.length ? (
        <ul className="divide-y">
          {active.map((t) => <TagRow key={t.id} tag={t} update={update} />)}
        </ul>
      ) : (
        <p className="py-1 text-sm text-muted-foreground">{empty}</p>
      )}
      {archived.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="mt-1 cursor-pointer rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {showArchived ? "Hide archived" : `Archived (${archived.length})`}
          </button>
          {showArchived && (
            <ul className="divide-y">
              {archived.map((t) => <TagRow key={t.id} tag={t} update={update} />)}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

function TagRow({ tag, update }: { tag: Tag; update: Rename }) {
  const [editing, setEditing] = React.useState(false)
  const [name, setName] = React.useState(tag.name)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const preset = "preset" in tag && tag.preset

  const run = async (patch: { name?: string; archived?: boolean }) => {
    setBusy(true)
    setError(null)
    try {
      await update(tag.id, patch)
      setEditing(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (editing)
    return (
      <li className="py-1.5">
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim() === tag.name) setEditing(false)
            else run({ name })
          }}
        >
          <Input
            aria-label={`New name for ${tag.name}`}
            value={name}
            maxLength={NAME_MAX}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                e.stopPropagation()
                setName(tag.name)
                setEditing(false)
              }
            }}
            className="h-8"
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>Save</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => { setName(tag.name); setEditing(false); setError(null) }}>Cancel</Button>
        </form>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </li>
    )

  return (
    <li className="py-1">
      <div className="flex min-h-8 items-center gap-1">
        <span className={cn("min-w-0 flex-1 truncate text-sm", tag.archived && "text-muted-foreground")}>{tag.name}</span>
        {preset && <span className="text-xs text-muted-foreground">Preset</span>}
        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(true)} aria-label={`Rename ${tag.name}`} disabled={busy}>
          <Pencil />
        </Button>
        <Button variant="ghost" size="sm" className="w-20" onClick={() => run({ archived: !tag.archived })} disabled={busy} aria-label={`${tag.archived ? "Restore" : "Archive"} ${tag.name}`}>
          {tag.archived ? "Restore" : "Archive"}
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  )
}

function AddForm({ label, placeholder, onAdd, extra }: { label: string; placeholder: string; onAdd: (name: string) => Promise<unknown>; extra?: React.ReactNode }) {
  const [name, setName] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const id = React.useId()
  return (
    <form
      className="space-y-1 border-t pt-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(null)
        try {
          await onAdd(name)
          setName("")
        } catch (err) {
          setError((err as Error).message)
        } finally {
          setBusy(false)
        }
      }}
    >
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <Input id={id} value={name} maxLength={NAME_MAX} placeholder={placeholder} onChange={(e) => setName(e.target.value)} className="h-8 min-w-40 flex-1" />
        {extra}
        <Button type="submit" size="sm" variant="outline" disabled={busy || !name.trim()} aria-label={label.replace("New", "Add")}>
          <Plus /> Add
        </Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </form>
  )
}
