/**
 * Shared in-memory fake for the Supabase service-role client used by the admin
 * submission listing and media access route tests. Backed by plain arrays for
 * events, guest_sessions, photos, and voice_notes, plus a mock storage client
 * that returns signed URLs. Supports the query shapes `admin-media-repo` uses:
 * select / eq / in / maybeSingle, and storage.createSignedUrl.
 */
export interface FakeEventIdRow {
  id: string;
  public_id: string;
  admin_id: string;
}
export interface FakeSessionIdRow {
  id: string;
  event_id: string;
  guest_name: string | null;
  public_ref: string;
}
export interface FakePhotoRow {
  id: string;
  guest_session_id: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  created_at: string;
}
export interface FakeVoiceRow {
  id: string;
  guest_session_id: string;
  storage_key: string;
  mime_type: string;
  file_size: number;
  duration_seconds: number;
  created_at: string;
}

export interface FakeMediaDbState {
  events: FakeEventIdRow[];
  sessions: FakeSessionIdRow[];
  photos: FakePhotoRow[];
  voice_notes: FakeVoiceRow[];
  signError?: { message?: string } | null;
}

type Filter =
  | { type: "eq"; col: string; val: string }
  | { type: "in"; col: string; vals: string[] };

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((f) => {
    if (f.type === "eq") return row[f.col] === f.val;
    return (f.vals as string[]).includes(row[f.col] as string);
  });
}

function project(row: Record<string, unknown>, cols: string | null): Record<string, unknown> {
  if (!cols) return row;
  const out: Record<string, unknown> = {};
  for (const c of cols.split(",").map((s) => s.trim())) {
    if (c in row) out[c] = row[c];
  }
  return out;
}

function buildQuery(rows: Record<string, unknown>[]) {
  const filters: Filter[] = [];
  let cols: string | null = null;

  const runList = () => {
    const data = rows.filter((r) => matches(r, filters)).map((r) => project(r, cols));
    return { data, error: null };
  };
  const runSingle = () => {
    const hit = rows.find((r) => matches(r, filters));
    return Promise.resolve(hit ? { data: project(hit, cols), error: null } : { data: null, error: null });
  };

  return {
    select(c: string) {
      cols = c;
      return this;
    },
    eq(col: string, val: string) {
      filters.push({ type: "eq", col, val });
      return this;
    },
    in(col: string, vals: string[]) {
      filters.push({ type: "in", col, vals });
      return this;
    },
    maybeSingle() {
      return runSingle();
    },
    then(resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) {
      return Promise.resolve(runList()).then(resolve, reject);
    },
  };
}

export function createFakeAdminMediaDb(state: FakeMediaDbState) {
  const tables: Record<string, Record<string, unknown>[]> = {
    events: state.events.map((r) => ({ ...r })),
    guest_sessions: state.sessions.map((r) => ({ ...r })),
    photos: state.photos.map((r) => ({ ...r })),
    voice_notes: state.voice_notes.map((r) => ({ ...r })),
  };

  return {
    from(table: string) {
      const rows = tables[table];
      if (!rows) throw new Error(`unexpected table: ${table}`);
      return buildQuery(rows);
    },
    storage: {
      from() {
        return {
          createSignedUrl: async (key: string, ttl: number) => {
            if (state.signError) return { data: null, error: state.signError };
            return {
              data: { signedUrl: `https://signed.example/${key}?t=${ttl}`, token: "tok" },
              error: null,
            };
          },
        };
      },
    },
  };
}