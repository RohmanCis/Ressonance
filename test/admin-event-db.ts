/**
 * Shared in-memory fake for the Supabase service-role client, used by the
 * admin event management route tests. Backed by a plain array so each test can
 * seed events and assert transitions without a live DB.
 */

export interface FakeEventRow {
  public_id: string;
  title: string;
  status: string;
  created_at: string;
  closed_at: string | null;
  admin_id: string;
}

export interface FakeDbState {
  events: FakeEventRow[];
  insertError?: { message?: string } | null;
  updateError?: { message?: string } | null;
  selectError?: { message?: string } | null;
}

function omitAdmin(row: FakeEventRow): Omit<FakeEventRow, "admin_id"> {
  const { admin_id, ...rest } = row;
  void admin_id;
  return rest;
}

export function createFakeDb(state: FakeDbState) {
  return {
    from(table: string) {
      if (table !== "events") throw new Error(`unexpected table: ${table}`);
      return {
        insert(row: Partial<FakeEventRow>) {
          return {
            select() {
              return {
                single: async () => {
                  if (state.insertError) return { data: null, error: state.insertError };
                  const full: FakeEventRow = {
                    public_id: row.public_id!,
                    title: row.title!,
                    status: "ACTIVE",
                    created_at: "2026-08-11T12:00:00Z",
                    closed_at: null,
                    admin_id: row.admin_id!,
                  };
                  state.events.push(full);
                  return { data: omitAdmin(full), error: null };
                },
              };
            },
          };
        },
        select() {
          return {
            eq(col: string, val: string) {
              return {
                order(orderCol: string, opts?: { ascending?: boolean }) {
                  if (state.selectError) return { data: null, error: state.selectError };
                  const rows = state.events
                    .filter((e) => e[col as keyof FakeEventRow] === val)
                    .map(omitAdmin)
                    .sort((a, b) => {
                      const dir = opts?.ascending === false ? -1 : 1;
                      const av = a[orderCol as keyof Omit<FakeEventRow, "admin_id">] ?? "";
                      const bv = b[orderCol as keyof Omit<FakeEventRow, "admin_id">] ?? "";
                      return av < bv ? -dir : av > bv ? dir : 0;
                    });
                  return { data: rows, error: null };
                },
                maybeSingle: async () => {
                  const hit = state.events.find((e) => e[col as keyof FakeEventRow] === val);
                  return hit ? { data: hit, error: null } : { data: null, error: null };
                },
                eq(col2: string, val2: string) {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => {
                          if (state.updateError) return { data: null, error: state.updateError };
                          const hit = state.events.find(
                            (e) => e[col as keyof FakeEventRow] === val && e[col2 as keyof FakeEventRow] === val2,
                          );
                          if (!hit) return { data: null, error: null };
                          hit.status = "CLOSED";
                          hit.closed_at = "2026-08-11T13:00:00Z";
                          return { data: omitAdmin({ ...hit }), error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            eq(col: string, val: string) {
              return {
                eq(col2: string, val2: string) {
                  return {
                    select() {
                      return {
                        maybeSingle: async () => {
                          if (state.updateError) return { data: null, error: state.updateError };
                          const hit = state.events.find(
                            (e) => e[col as keyof FakeEventRow] === val && e[col2 as keyof FakeEventRow] === val2,
                          );
                          if (!hit) return { data: null, error: null };
                          hit.status = "CLOSED";
                          hit.closed_at = "2026-08-11T13:00:00Z";
                          return { data: omitAdmin({ ...hit }), error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}