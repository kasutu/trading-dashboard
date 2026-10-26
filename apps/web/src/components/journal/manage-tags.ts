import { updateMistake, updateSetup } from "@/hooks/use-api"
import type { ManageTags } from "./chips"

/** Rename and archive setups and mistake tags right in the chips. */
export const SETUP_TAGS: ManageTags = { rename: (id, name) => updateSetup(id, { name }), archive: (id) => updateSetup(id, { archived: true }) }
export const MISTAKE_TAGS: ManageTags = { rename: (id, name) => updateMistake(id, { name }), archive: (id) => updateMistake(id, { archived: true }) }
