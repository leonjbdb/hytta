import {
  getDemoState,
  setDemoState,
  updateDemoState,
} from './demo-cache';
import type { DemoState } from './demo-state';

type StateKey = keyof DemoState;
type DemoRow = Record<string, unknown>;
type DriverRow = Record<string, unknown>;
type RowContext = Record<string, DemoRow | null> & {
  __tables?: Record<string, string>;
};

interface TableMeta {
  stateKey: StateKey;
  columns: Record<string, string>;
  booleans?: readonly string[];
  dates?: readonly string[];
}

const TABLES: Record<string, TableMeta> = {
  user: {
    stateKey: 'users',
    columns: {
      id: 'id',
      name: 'name',
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      email_verified: 'emailVerified',
      image: 'image',
      password_hash: 'passwordHash',
      is_admin: 'isAdmin',
      is_manager: 'isManager',
      is_invitee: 'isInvitee',
      notify_enabled: 'notifyEnabled',
      notify_booking: 'notifyBooking',
      notify_requests: 'notifyRequests',
      first_login_completed_at: 'firstLoginCompletedAt',
      calendar_token: 'calendarToken',
      created_at: 'createdAt',
    },
    booleans: [
      'is_admin',
      'is_manager',
      'is_invitee',
      'notify_enabled',
      'notify_booking',
      'notify_requests',
    ],
    dates: ['email_verified'],
  },
  account: {
    stateKey: 'accounts',
    columns: {
      user_id: 'userId',
      type: 'type',
      provider: 'provider',
      provider_account_id: 'providerAccountId',
      refresh_token: 'refresh_token',
      access_token: 'access_token',
      expires_at: 'expires_at',
      token_type: 'token_type',
      scope: 'scope',
      id_token: 'id_token',
      session_state: 'session_state',
    },
  },
  session: {
    stateKey: 'sessions',
    columns: {
      session_token: 'sessionToken',
      user_id: 'userId',
      expires: 'expires',
    },
    dates: ['expires'],
  },
  verification_token: {
    stateKey: 'verificationTokens',
    columns: {
      identifier: 'identifier',
      token: 'token',
      expires: 'expires',
    },
    dates: ['expires'],
  },
  password_reset_token: {
    stateKey: 'passwordResetTokens',
    columns: {
      id: 'id',
      user_id: 'userId',
      token_hash: 'tokenHash',
      expires_at: 'expiresAt',
      consumed_at: 'consumedAt',
      created_at: 'createdAt',
    },
    dates: ['expires_at', 'consumed_at'],
  },
  cottage_settings: {
    stateKey: 'cottageSettings',
    columns: {
      id: 'id',
      name: 'name',
      description: 'description',
      created_at: 'createdAt',
      updated_at: 'updatedAt',
    },
  },
  room: {
    stateKey: 'rooms',
    columns: {
      id: 'id',
      name_nb: 'nameNb',
      name_en: 'nameEn',
      icon: 'icon',
      color: 'color',
      capacity_mode: 'capacityMode',
      slot_count: 'slotCount',
      created_at: 'createdAt',
    },
  },
  bed: {
    stateKey: 'beds',
    columns: {
      id: 'id',
      room_id: 'roomId',
      kind: 'kind',
      label: 'label',
      created_at: 'createdAt',
    },
  },
  group_template: {
    stateKey: 'groupTemplates',
    columns: {
      id: 'id',
      name: 'name',
      created_by: 'createdBy',
      created_at: 'createdAt',
    },
  },
  group_member: {
    stateKey: 'groupMembers',
    columns: {
      id: 'id',
      group_id: 'groupId',
      user_id: 'userId',
      guest_name: 'guestName',
      preferred_room_id: 'preferredRoomId',
      preferred_bed_id: 'preferredBedId',
      position: 'position',
      created_at: 'createdAt',
    },
  },
  dugnad_task: {
    stateKey: 'dugnadTasks',
    columns: {
      id: 'id',
      title: 'title',
      description: 'description',
      created_by: 'createdBy',
      created_at: 'createdAt',
      completed_by: 'completedBy',
      completed_at: 'completedAt',
    },
  },
  reservation: {
    stateKey: 'reservations',
    columns: {
      id: 'id',
      booking_id: 'bookingId',
      booker_id: 'bookerId',
      user_id: 'userId',
      guest_name: 'guestName',
      target_kind: 'targetKind',
      room_id: 'roomId',
      bed_id: 'bedId',
      start_date: 'startDate',
      end_date: 'endDate',
      status: 'status',
      created_at: 'createdAt',
    },
  },
  invitation: {
    stateKey: 'invitations',
    columns: {
      id: 'id',
      token: 'token',
      created_by: 'createdBy',
      max_uses: 'maxUses',
      use_count: 'useCount',
      email: 'email',
      expires_at: 'expiresAt',
      revoked_at: 'revokedAt',
      created_at: 'createdAt',
    },
    dates: ['expires_at', 'revoked_at'],
  },
};

const STATE_KEY_BY_TABLE = new Map(
  Object.entries(TABLES).map(([table, meta]) => [meta.stateKey, table] as const),
);

interface ExecutionResult {
  rows: DriverRow[];
  changes: number;
}

class DemoD1PreparedStatement implements D1PreparedStatement {
  readonly sql: string;
  readonly params: unknown[];
  private readonly state: DemoState | null;

  constructor(sql: string, params: unknown[] = [], state: DemoState | null = null) {
    this.sql = sql;
    this.params = params;
    this.state = state;
  }

  bind(...values: unknown[]): D1PreparedStatement {
    return new DemoD1PreparedStatement(this.sql, values, this.state);
  }

  first<T = unknown>(colName: string): Promise<T | null>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  async first<T = unknown>(colName?: string): Promise<T | null> {
    const result = await this.all<Record<string, unknown>>();
    const row = result.results[0];
    if (!row) return null;
    return (colName ? row[colName] : row) as T;
  }

  async run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await executeStatement(this.sql, this.params, this.state);
    return makeD1Result<T>([], result.changes);
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const result = await executeStatement(this.sql, this.params, this.state);
    return makeD1Result<T>(result.rows as T[], result.changes);
  }

  raw<T = unknown[]>(options: { columnNames: true }): Promise<[string[], ...T[]]>;
  raw<T = unknown[]>(options?: { columnNames?: false }): Promise<T[]>;
  async raw<T = unknown[]>(
    options?: { columnNames?: boolean },
  ): Promise<T[] | [string[], ...T[]]> {
    const result = await executeStatement(this.sql, this.params, this.state);
    const rows = result.rows.map((row) => Object.values(row) as T);
    if (!options?.columnNames) return rows;
    const columnNames = Object.keys(result.rows[0] ?? {});
    return [columnNames, ...rows] as [string[], ...T[]];
  }
}

class DemoD1Database implements D1Database {
  constructor(private readonly state: DemoState | null = null) {}

  prepare(query: string): D1PreparedStatement {
    return new DemoD1PreparedStatement(query, [], this.state);
  }

  async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    if (this.state) {
      return executeBatchOnState(this.state, statements).map((result) =>
        makeD1Result<T>(result.rows as T[], result.changes),
      );
    }
    return updateDemoState(async (state) => {
      return executeBatchOnState(state, statements).map((result) =>
        makeD1Result<T>(result.rows as T[], result.changes),
      );
    });
  }

  async exec(query: string): Promise<D1ExecResult> {
    await executeStatement(query, [], this.state);
    return { count: 1, duration: 0 };
  }

  withSession(_constraintOrBookmark?: D1SessionBookmark | D1SessionConstraint): D1DatabaseSession {
    return new DemoD1DatabaseSession(this);
  }

  dump(): Promise<ArrayBuffer> {
    throw new Error('[demo] D1 dump is not supported in cache-only demo mode.');
  }
}

class DemoD1DatabaseSession implements D1DatabaseSession {
  constructor(private readonly database: DemoD1Database) {}

  prepare(query: string): D1PreparedStatement {
    return this.database.prepare(query);
  }

  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return this.database.batch<T>(statements);
  }

  getBookmark(): D1SessionBookmark | null {
    return null;
  }
}

let demoD1: D1Database | null = null;

export function getDemoD1(): D1Database {
  demoD1 ??= new DemoD1Database();
  return demoD1;
}

export function getDemoD1ForState(state: DemoState): D1Database {
  return new DemoD1Database(state);
}

async function executeStatement(
  sql: string,
  params: unknown[],
  stateOverride: DemoState | null = null,
): Promise<ExecutionResult> {
  if (stateOverride) {
    return executeStatementOnState(stateOverride, sql, params);
  }
  if (isReadSql(sql)) {
    const state = await getDemoState();
    return executeStatementOnState(state, sql, params);
  }
  return updateDemoState((state) => executeStatementOnState(state, sql, params));
}

function executeStatementOnState(
  state: DemoState,
  sql: string,
  params: unknown[],
): ExecutionResult {
  const normalized = normalizeSql(sql);
  const lower = normalized.toLowerCase();
  if (lower.startsWith('select ')) return executeSelect(state, normalized, params);
  if (lower.startsWith('insert ')) return executeInsert(state, normalized, params);
  if (lower.startsWith('update ')) return executeUpdate(state, normalized, params);
  if (lower.startsWith('delete ')) return executeDelete(state, normalized, params);
  if (lower.startsWith('with recursive ')) return executeRawSelect(state, normalized, params);
  throw unsupportedSql(normalized);
}

function executeBatchOnState(
  state: DemoState,
  statements: D1PreparedStatement[],
): ExecutionResult[] {
  const draft = structuredClone(state) as DemoState;
  const results: ExecutionResult[] = [];

  for (const statement of statements) {
    const demoStatement = toDemoStatement(statement);
    results.push(
      executeStatementOnState(draft, demoStatement.sql, demoStatement.params),
    );
  }

  Object.assign(state, draft);
  return results;
}

function toDemoStatement(statement: D1PreparedStatement): DemoD1PreparedStatement {
  if (statement instanceof DemoD1PreparedStatement) return statement;
  throw new Error('[demo] Cache D1 batch received a non-demo D1 statement.');
}

function executeRawSelect(
  _state: DemoState,
  sql: string,
  _params: unknown[],
): ExecutionResult {
  throw unsupportedSql(sql);
}

function executeSelect(state: DemoState, sql: string, params: unknown[]): ExecutionResult {
  const fromMatch =
    /\bfrom\s+"?([\w]+)"?(?:\s+(?:as\s+"?([\w]+)"?|(?!"?(?:where|left|inner|order|limit)\b)"?([\w]+)"?))?/i.exec(sql);
  if (!fromMatch) throw unsupportedSql(sql);
  const table = fromMatch[1]!;
  const fromAlias = fromMatch[2] ?? fromMatch[3];
  const mainAlias = fromAlias && !isSqlKeyword(fromAlias) ? fromAlias : table;
  const aliasTables = new Map<string, string>([[mainAlias, table]]);

  const selectPart = sql.slice('select '.length, fromMatch.index).trim();
  const afterFrom = sql.slice(fromMatch.index + fromMatch[0].length);
  const joins = parseJoins(afterFrom, aliasTables);
  const wherePart = extractClause(afterFrom, 'where', ['order by', 'limit']);
  const orderPart = extractClause(afterFrom, 'order by', ['limit']);
  const limitPart = extractClause(afterFrom, 'limit', []);
  let nextParamIndex = 0;

  const baseRows = rowsForTable(state, table);
  let contexts: RowContext[] = baseRows.map((row) => ({
    __tables: { [mainAlias]: table },
    [mainAlias]: row,
  }));

  for (const join of joins) {
    const joinedRows = rowsForTable(state, join.table);
    const next: RowContext[] = [];
    const predicate = buildPredicate(join.on, 0).predicate;
    for (const context of contexts) {
      let matched = false;
      for (const row of joinedRows) {
        const joined = {
          ...context,
          __tables: { ...(context.__tables ?? {}), [join.alias]: join.table },
          [join.alias]: row,
        };
        if (!predicate(joined, [])) continue;
        next.push(joined);
        matched = true;
      }
      if (!matched && join.kind === 'left') {
        next.push({
          ...context,
          __tables: { ...(context.__tables ?? {}), [join.alias]: join.table },
          [join.alias]: null,
        });
      }
    }
    contexts = next;
  }

  if (wherePart) {
    const built = buildPredicate(wherePart, 0);
    contexts = contexts.filter((context) => built.predicate(context, params));
    nextParamIndex = built.nextParamIndex;
  }

  if (orderPart) {
    const orderings = splitTopLevel(orderPart, ',').map(parseOrdering);
    contexts.sort((a, b) => compareContexts(a, b, orderings));
  }

  if (limitPart) {
    const limit = parseLimit(limitPart, params, nextParamIndex);
    contexts = contexts.slice(0, limit);
  }

  return {
    rows: contexts.map((context) => projectSelectRow(selectPart, context, aliasTables)),
    changes: 0,
  };
}

interface JoinSpec {
  kind: 'left' | 'inner';
  table: string;
  alias: string;
  on: string;
}

function parseJoins(sqlAfterFrom: string, aliasTables: Map<string, string>): JoinSpec[] {
  const joins: JoinSpec[] = [];
  const joinRegex =
    /\b(left|inner)\s+join\s+"?([\w]+)"?(?:\s+(?:as\s+"?([\w]+)"?|(?!"?(?:on|where|left|inner|order|limit)\b)"?([\w]+)"?))?\s+on\s+/gi;
  let match: RegExpExecArray | null;
  while ((match = joinRegex.exec(sqlAfterFrom)) !== null) {
    const onStart = match.index + match[0].length;
    const nextJoin = findNextKeyword(sqlAfterFrom, onStart, [
      ' left join ',
      ' inner join ',
      ' where ',
      ' order by ',
      ' limit ',
    ]);
    const table = match[2]!;
    const aliasMatch = match[3] ?? match[4];
    const alias = aliasMatch && !isSqlKeyword(aliasMatch) ? aliasMatch : table;
    aliasTables.set(alias, table);
    joins.push({
      kind: match[1] === 'inner' ? 'inner' : 'left',
      table,
      alias,
      on: sqlAfterFrom.slice(onStart, nextJoin ?? undefined).trim(),
    });
  }
  return joins;
}

function executeInsert(state: DemoState, sql: string, params: unknown[]): ExecutionResult {
  const match = /^insert\s+into\s+"?([\w]+)"?\s*\(([^)]+)\)\s+values\s+([\s\S]+)$/i.exec(sql);
  if (!match) throw unsupportedSql(sql);
  const table = match[1]!;
  const columns = parseColumnList(match[2]!);
  const tail = match[3]!;
  const valuesPart = tail.split(/\bon\s+conflict\b|\breturning\b/i)[0]!.trim();
  const valueGroupCount = splitTopLevel(valuesPart, ',')
    .filter((part) => part.trim().startsWith('('))
    .length;
  const rows = rowsForTable(state, table);
  const meta = metaForTable(table);
  let paramIndex = 0;
  let changes = 0;
  const insertedOrUpdated: DemoRow[] = [];

  for (let i = 0; i < valueGroupCount; i += 1) {
    const nextRow = applyDefaults(table, {});
    for (const column of columns) {
      setColumnValue(meta, nextRow, column, params[paramIndex]);
      paramIndex += 1;
    }

    const conflict = parseConflict(sql, table);
    const existing = conflict
      ? rows.find((row) =>
          conflict.targetColumns.every((column) =>
            valuesEqual(getColumnValue(meta, row, column), getColumnValue(meta, nextRow, column)),
          ),
        )
      : null;

    if (existing && conflict?.kind === 'nothing') {
      insertedOrUpdated.push(existing);
      continue;
    }
    if (existing && conflict?.kind === 'update') {
      let conflictParamIndex = paramIndex;
      for (const assignment of conflict.assignments) {
        applyAssignment(meta, existing, assignment, params, conflictParamIndex);
        conflictParamIndex += assignment.consumesParam ? 1 : 0;
      }
      paramIndex = conflictParamIndex;
      insertedOrUpdated.push(existing);
      changes += 1;
      continue;
    }

    rows.push(nextRow);
    insertedOrUpdated.push(nextRow);
    changes += 1;
  }

  return {
    rows: projectReturningRows(sql, table, insertedOrUpdated),
    changes,
  };
}

function executeUpdate(state: DemoState, sql: string, params: unknown[]): ExecutionResult {
  const match = /^update\s+"?([\w]+)"?\s+set\s+([\s\S]+)$/i.exec(sql);
  if (!match) throw unsupportedSql(sql);
  const table = match[1]!;
  const meta = metaForTable(table);
  const rows = rowsForTable(state, table);
  const updateParts = parseUpdateTail(match[2]!);
  const setPart = updateParts.setPart;
  const wherePart = updateParts.wherePart;
  const assignments = parseSetAssignments(setPart);
  const setParamCount = assignments.filter((a) => a.consumesParam).length;
  const whereParams = params.slice(setParamCount);
  const predicate = wherePart
    ? buildPredicate(wherePart, 0).predicate
    : () => true;
  const changed: DemoRow[] = [];

  for (const row of rows) {
    if (!predicate({ [table]: row }, whereParams)) continue;
    let paramIndex = 0;
    for (const assignment of assignments) {
      applyAssignment(meta, row, assignment, params, paramIndex);
      paramIndex += assignment.consumesParam ? 1 : 0;
    }
    changed.push(row);
  }

  return {
    rows: updateParts.returningPart
      ? projectSelectRows(updateParts.returningPart, table, changed)
      : [],
    changes: changed.length,
  };
}

function applyAssignment(
  meta: TableMeta,
  row: DemoRow,
  assignment: SetAssignment,
  params: unknown[],
  paramIndex: number,
): void {
  if (assignment.increment != null || assignment.incrementParam) {
    const current = Number(getColumnValue(meta, row, assignment.column) ?? 0);
    const delta = assignment.incrementParam
      ? Number(params[paramIndex] ?? 0)
      : assignment.increment ?? 0;
    setColumnValue(meta, row, assignment.column, current + delta);
    return;
  }
  if (assignment.hasLiteral) {
    setColumnValue(meta, row, assignment.column, assignment.literal);
    return;
  }
  setColumnValue(meta, row, assignment.column, params[paramIndex]);
}

function parseUpdateTail(tail: string): {
  setPart: string;
  wherePart: string | null;
  returningPart: string | null;
} {
  const returningIndex = findTopLevelKeyword(tail, 'returning');
  const beforeReturning =
    returningIndex == null ? tail.trim() : tail.slice(0, returningIndex).trim();
  const returningPart =
    returningIndex == null ? null : tail.slice(returningIndex + 'returning'.length).trim();
  const whereIndex = findTopLevelKeyword(beforeReturning, 'where');
  if (whereIndex == null) {
    return { setPart: beforeReturning, wherePart: null, returningPart };
  }
  return {
    setPart: beforeReturning.slice(0, whereIndex).trim(),
    wherePart: beforeReturning.slice(whereIndex + 'where'.length).trim(),
    returningPart,
  };
}

function executeDelete(state: DemoState, sql: string, params: unknown[]): ExecutionResult {
  const match = /^delete\s+from\s+"?([\w]+)"?(?:\s+where\s+([\s\S]+))?$/i.exec(sql);
  if (!match) throw unsupportedSql(sql);
  const table = match[1]!;
  const rows = rowsForTable(state, table);
  const wherePart = match[2]?.trim();
  const predicate = wherePart
    ? buildPredicate(wherePart, 0).predicate
    : () => true;
  let changes = 0;

  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i]!;
    if (!predicate({ [table]: row }, params)) continue;
    applyDeleteCascade(state, table, row);
    rows.splice(i, 1);
    changes += 1;
  }

  return { rows: [], changes };
}

function applyDeleteCascade(state: DemoState, table: string, row: DemoRow): void {
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return;

  if (table === 'user') {
    state.accounts = state.accounts.filter((account) => account.userId !== id);
    state.sessions = state.sessions.filter((session) => session.userId !== id);
    state.passwordResetTokens = state.passwordResetTokens.filter((token) => token.userId !== id);
    state.invitations = state.invitations.filter((invite) => invite.createdBy !== id);
    state.reservations = state.reservations.filter(
      (reservation) => reservation.bookerId !== id && reservation.userId !== id,
    );
    state.groupMembers = state.groupMembers.filter((member) => member.userId !== id);
    state.groupTemplates = state.groupTemplates.map((group) =>
      group.createdBy === id ? { ...group, createdBy: null } : group,
    );
    state.dugnadTasks = state.dugnadTasks
      .filter((task) => task.createdBy !== id)
      .map((task) =>
        task.completedBy === id ? { ...task, completedBy: null } : task,
      );
    return;
  }

  if (table === 'room') {
    const bedIds = state.beds.filter((bed) => bed.roomId === id).map((bed) => bed.id);
    state.beds = state.beds.filter((bed) => bed.roomId !== id);
    state.reservations = state.reservations.filter(
      (reservation) =>
        reservation.roomId !== id &&
        (reservation.bedId == null || !bedIds.includes(reservation.bedId)),
    );
    state.groupMembers = state.groupMembers.map((member) =>
      member.preferredRoomId === id
        ? { ...member, preferredRoomId: null, preferredBedId: null }
        : bedIds.includes(member.preferredBedId ?? '')
          ? { ...member, preferredBedId: null }
          : member,
    );
    return;
  }

  if (table === 'bed') {
    state.reservations = state.reservations.filter((reservation) => reservation.bedId !== id);
    state.groupMembers = state.groupMembers.map((member) =>
      member.preferredBedId === id ? { ...member, preferredBedId: null } : member,
    );
    return;
  }

  if (table === 'group_template') {
    state.groupMembers = state.groupMembers.filter((member) => member.groupId !== id);
  }
}

interface ConflictSpec {
  targetColumns: string[];
  kind: 'nothing' | 'update';
  assignments: SetAssignment[];
}

function parseConflict(sql: string, table: string): ConflictSpec | null {
  const conflictMatch = /\bon\s+conflict\s*\(([^)]+)\)\s+do\s+(nothing|update\s+set\s+([\s\S]+?))(?:\s+returning\b|$)/i.exec(sql);
  if (!conflictMatch) return null;
  const targetColumns = parseColumnList(conflictMatch[1]!);
  if (conflictMatch[2]!.toLowerCase() === 'nothing') {
    return { targetColumns, kind: 'nothing', assignments: [] };
  }
  return {
    targetColumns,
    kind: 'update',
    assignments: parseSetAssignments(conflictMatch[3] ?? '', table),
  };
}

interface SetAssignment {
  column: string;
  consumesParam: boolean;
  increment?: number;
  incrementParam?: boolean;
  hasLiteral?: boolean;
  literal?: unknown;
}

function parseSetAssignments(setPart: string, table?: string): SetAssignment[] {
  return splitTopLevel(setPart, ',').map((assignment) => {
    const match = /"?([\w]+)"?\s*=\s*([\s\S]+)/.exec(assignment.trim());
    if (!match) throw unsupportedSql(setPart);
    const column = match[1]!;
    const rhs = match[2]!.trim();
    const source = table
      ? `(?:"?${table}"?\\.)?"?${column}"?`
      : `(?:"?[\\w]+"?\\.)?"?${column}"?`;
    const incrementLiteral = new RegExp(`${source}\\s*\\+\\s*(\\d+)`, 'i').exec(rhs);
    const incrementParam = new RegExp(`${source}\\s*\\+\\s*\\?`, 'i').test(rhs);
    const literal = parseSqlLiteral(rhs);
    const consumesParam = rhs.includes('?');
    if (!consumesParam && !incrementLiteral && !incrementParam && !literal.matched) {
      throw unsupportedSql(assignment);
    }
    return {
      column,
      consumesParam,
      increment: incrementLiteral ? Number(incrementLiteral[1]) : undefined,
      incrementParam,
      hasLiteral: literal.matched,
      literal: literal.value,
    };
  });
}

function parseSqlLiteral(rhs: string): { matched: boolean; value?: unknown } {
  if (/^null$/i.test(rhs)) return { matched: true, value: null };
  if (/^true$/i.test(rhs)) return { matched: true, value: 1 };
  if (/^false$/i.test(rhs)) return { matched: true, value: 0 };
  if (/^-?\d+(?:\.\d+)?$/.test(rhs)) return { matched: true, value: Number(rhs) };
  const stringMatch = /^'((?:''|[^'])*)'$/.exec(rhs);
  if (stringMatch) {
    return { matched: true, value: stringMatch[1]!.replace(/''/g, "'") };
  }
  return { matched: false };
}

type Predicate = (context: RowContext, params: unknown[]) => boolean;

function buildPredicate(sql: string, startParamIndex: number): {
  predicate: Predicate;
  nextParamIndex: number;
} {
  const trimmed = trimOuterParens(sql.trim());
  const orParts = splitTopLevel(trimmed, 'or');
  if (orParts.length > 1) {
    let index = startParamIndex;
    const predicates = orParts.map((part) => {
      const built = buildPredicate(part, index);
      index = built.nextParamIndex;
      return built.predicate;
    });
    return {
      predicate: (context, params) => predicates.some((p) => p(context, params)),
      nextParamIndex: index,
    };
  }

  const andParts = splitTopLevel(trimmed, 'and');
  if (andParts.length > 1) {
    let index = startParamIndex;
    const predicates = andParts.map((part) => {
      const built = buildPredicate(part, index);
      index = built.nextParamIndex;
      return built.predicate;
    });
    return {
      predicate: (context, params) => predicates.every((p) => p(context, params)),
      nextParamIndex: index,
    };
  }

  if (/^true$/i.test(trimmed)) {
    return { predicate: () => true, nextParamIndex: startParamIndex };
  }
  if (/^false$/i.test(trimmed)) {
    return { predicate: () => false, nextParamIndex: startParamIndex };
  }

  const nullMatch = /^(.+?)\s+is\s+(not\s+)?null$/i.exec(trimmed);
  if (nullMatch) {
    const ref = nullMatch[1]!.trim();
    const negate = Boolean(nullMatch[2]);
    return {
      predicate: (context) => {
        const value = resolveValue(ref, context, []);
        return negate ? value != null : value == null;
      },
      nextParamIndex: startParamIndex,
    };
  }

  const inMatch = /^(.+?)\s+in\s+\(([\s\S]+)\)$/i.exec(trimmed);
  if (inMatch) {
    const ref = inMatch[1]!.trim();
    const placeholders = inMatch[2]!.split(',').filter((p) => p.trim() === '?').length;
    const paramIndex = startParamIndex;
    return {
      predicate: (context, params) => {
        const left = resolveValue(ref, context, params);
        const values = params.slice(paramIndex, paramIndex + placeholders);
        return values.some((value) => valuesEqual(left, value));
      },
      nextParamIndex: startParamIndex + placeholders,
    };
  }

  const compareMatch = /^(.+?)\s*(=|<>|!=|<=|>=|<|>)\s*(.+)$/i.exec(trimmed);
  if (compareMatch) {
    const leftRef = compareMatch[1]!.trim();
    const operator = compareMatch[2]!;
    const rightRef = compareMatch[3]!.trim();
    const paramIndex = startParamIndex;
    const consumesParam = rightRef === '?';
    return {
      predicate: (context, params) => {
        const left = resolveValue(leftRef, context, params);
        const right = consumesParam
          ? params[paramIndex]
          : resolveValue(rightRef, context, params);
        return compareValues(left, right, operator);
      },
      nextParamIndex: consumesParam ? startParamIndex + 1 : startParamIndex,
    };
  }

  throw unsupportedSql(trimmed);
}

function projectSelectRow(
  selectPart: string,
  context: RowContext,
  aliasTables: Map<string, string>,
): DriverRow {
  const row: DriverRow = {};
  if (selectPart.trim() === '*') {
    for (const [alias, value] of Object.entries(context)) {
      if (alias === '__tables') continue;
      const table = aliasTables.get(alias);
      if (!table || !value) continue;
      Object.assign(row, toDriverRow(table, value));
    }
    return row;
  }

  for (const item of splitTopLevel(selectPart, ',')) {
    const parsed = parseSelectItem(item);
    const value = resolveValue(parsed.expression, context, []);
    row[parsed.alias] = value;
  }
  return row;
}

function parseSelectItem(item: string): { expression: string; alias: string } {
  const trimmed = item.trim();
  const aliasMatch = /^([\s\S]+?)\s+as\s+"?([\w]+)"?$/i.exec(trimmed);
  if (aliasMatch) {
    return { expression: aliasMatch[1]!.trim(), alias: aliasMatch[2]! };
  }
  const columnMatch = /"?([\w]+)"?(?:\."?([\w]+)"?)?$/.exec(trimmed);
  if (!columnMatch) throw unsupportedSql(trimmed);
  return {
    expression: trimmed,
    alias: columnMatch[2] ?? columnMatch[1]!,
  };
}

function projectReturningRows(sql: string, table: string, rows: DemoRow[]): DriverRow[] {
  const returning = extractReturning(sql);
  if (!returning) return [];
  return projectSelectRows(returning, table, rows);
}

function projectSelectRows(selectPart: string, table: string, rows: DemoRow[]): DriverRow[] {
  const aliasTables = new Map<string, string>([[table, table]]);
  return rows.map((row) =>
    projectSelectRow(selectPart, { [table]: row }, aliasTables),
  );
}

function extractReturning(sql: string): string | null {
  const match = /\breturning\s+([\s\S]+)$/i.exec(sql);
  return match ? match[1]!.trim() : null;
}

function rowsForTable(state: DemoState, table: string): DemoRow[] {
  const meta = metaForTable(table);
  return state[meta.stateKey] as unknown as DemoRow[];
}

function metaForTable(table: string): TableMeta {
  const meta = TABLES[table];
  if (!meta) throw new Error(`[demo] Unsupported table in cache demo mode: ${table}`);
  return meta;
}

function getColumnValue(meta: TableMeta, row: DemoRow, column: string): unknown {
  const col = unquote(column);
  const prop = meta.columns[col];
  if (!prop) throw new Error(`[demo] Unsupported column ${column}.`);
  const value = row[prop];
  if (meta.booleans?.includes(col)) return value ? 1 : 0;
  if (meta.dates?.includes(col)) {
    if (value == null) return null;
    if (value instanceof Date) return value;
    return new Date(Number(value));
  }
  return value;
}

function setColumnValue(meta: TableMeta, row: DemoRow, column: string, value: unknown): void {
  const col = unquote(column);
  const prop = meta.columns[col];
  if (!prop) throw new Error(`[demo] Unsupported column ${column}.`);
  row[prop] = meta.booleans?.includes(col) ? Boolean(value) : normalizeStoredValue(value);
}

function normalizeStoredValue(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return value;
}

function toDriverRow(table: string, row: DemoRow): DriverRow {
  const meta = metaForTable(table);
  const out: DriverRow = {};
  for (const [column, prop] of Object.entries(meta.columns)) {
    const value = getColumnValue(meta, row, column);
    out[column] = value;
    out[prop] = value;
  }
  return out;
}

function applyDefaults(table: string, row: DemoRow): DemoRow {
  const nowSec = Math.floor(Date.now() / 1000);
  const withId = () => {
    row.id ??= crypto.randomUUID();
  };
  switch (table) {
    case 'user':
      withId();
      row.name ??= null;
      row.firstName ??= null;
      row.lastName ??= null;
      row.emailVerified ??= null;
      row.image ??= null;
      row.passwordHash ??= null;
      row.isAdmin ??= false;
      row.isManager ??= false;
      row.isInvitee ??= false;
      row.notifyEnabled ??= false;
      row.notifyBooking ??= true;
      row.notifyRequests ??= true;
      row.firstLoginCompletedAt ??= null;
      row.calendarToken ??= null;
      row.createdAt ??= nowSec;
      break;
    case 'invitation':
    case 'password_reset_token':
    case 'room':
    case 'bed':
    case 'group_template':
    case 'group_member':
    case 'dugnad_task':
    case 'reservation':
      withId();
      row.createdAt ??= nowSec;
      break;
    case 'cottage_settings':
      row.id ??= 'singleton';
      row.description ??= null;
      row.createdAt ??= nowSec;
      row.updatedAt ??= nowSec;
      break;
  }
  if (table === 'invitation') row.useCount ??= 0;
  if (table === 'reservation') row.status ??= 'PENDING';
  if (table === 'room') {
    row.color ??= '#64748b';
    row.capacityMode ??= 'BEDS';
    row.slotCount ??= null;
  }
  return row;
}

function resolveValue(ref: string, context: RowContext, _params: unknown[]): unknown {
  const trimmed = ref.trim();
  if (trimmed === 'null') return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const stringMatch = /^'([^']*)'$/.exec(trimmed);
  if (stringMatch) return stringMatch[1];
  const columnMatch = /^"?([\w]+)"?(?:\."?([\w]+)"?)?$/.exec(trimmed);
  if (!columnMatch) throw unsupportedSql(trimmed);
  const alias = columnMatch[2]
    ? columnMatch[1]!
    : Object.keys(context).find((key) => key !== '__tables');
  if (!alias) throw unsupportedSql(trimmed);
  const column = columnMatch[2] ?? columnMatch[1]!;
  const row = context[alias];
  if (!row) return null;
  const table = context.__tables?.[alias] ?? alias;
  return getColumnValue(metaForTable(table), row, column);
}

function compareValues(left: unknown, right: unknown, operator: string): boolean {
  switch (operator) {
    case '=':
      return valuesEqual(left, right);
    case '<>':
    case '!=':
      return !valuesEqual(left, right);
    case '<=':
      return compareOrderedValues(left, right, (comparison) => comparison <= 0);
    case '>=':
      return compareOrderedValues(left, right, (comparison) => comparison >= 0);
    case '<':
      return compareOrderedValues(left, right, (comparison) => comparison < 0);
    case '>':
      return compareOrderedValues(left, right, (comparison) => comparison > 0);
    default:
      throw new Error(`[demo] Unsupported SQL operator: ${operator}`);
  }
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return comparable(left) === comparable(right);
}

type ComparableValue = string | number | null;
type OrderedComparableValue = Exclude<ComparableValue, null>;

function compareOrderedValues(
  left: unknown,
  right: unknown,
  compare: (comparison: number) => boolean,
): boolean {
  const leftValue = comparable(left);
  const rightValue = comparable(right);
  if (leftValue == null || rightValue == null) return false;
  return compare(compareComparableValues(leftValue, rightValue));
}

function comparable(value: unknown): ComparableValue {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number' || value === null) return value;
  if (typeof value === 'string') return value;
  return value == null ? null : String(value);
}

function compareContexts(
  a: RowContext,
  b: RowContext,
  orderings: { ref: string; desc: boolean }[],
): number {
  for (const ordering of orderings) {
    const av = comparable(resolveValue(ordering.ref, a, []));
    const bv = comparable(resolveValue(ordering.ref, b, []));
    if (av === bv) continue;
    if (av == null) return ordering.desc ? 1 : -1;
    if (bv == null) return ordering.desc ? -1 : 1;
    const result = compareComparableValues(av, bv);
    return ordering.desc ? -result : result;
  }
  return 0;
}

function compareComparableValues(
  left: OrderedComparableValue,
  right: OrderedComparableValue,
): number {
  if (typeof left === 'number' && typeof right === 'number') {
    if (left === right) return 0;
    return left < right ? -1 : 1;
  }
  const leftString = String(left);
  const rightString = String(right);
  if (leftString === rightString) return 0;
  return leftString < rightString ? -1 : 1;
}

function parseOrdering(part: string): { ref: string; desc: boolean } {
  const trimmed = part.trim();
  return {
    ref: trimmed.replace(/\s+(asc|desc)$/i, ''),
    desc: /\s+desc$/i.test(trimmed),
  };
}

function parseLimit(limitPart: string, params: unknown[], paramIndex: number): number {
  const token = limitPart.trim().split(/\s+/)[0];
  if (!token) throw unsupportedSql(`limit ${limitPart}`);
  const raw = token === '?' ? params[paramIndex] : token;
  const limit = Number(raw);
  if (!Number.isInteger(limit) || limit < 0) throw unsupportedSql(`limit ${limitPart}`);
  return limit;
}

function parseColumnList(input: string): string[] {
  return input
    .split(',')
    .map((column) => unquote(column.trim().split('.').pop() ?? column.trim()));
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  const lower = input.toLowerCase();
  const wordDelimiter = /^[a-z]+$/i.test(delimiter);

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth !== 0) continue;

    if (wordDelimiter) {
      const before = i === 0 || /\s|\(/.test(input[i - 1]!);
      const after = i + delimiter.length >= input.length || /\s|\)/.test(input[i + delimiter.length]!);
      if (before && after && lower.slice(i, i + delimiter.length) === delimiter) {
        parts.push(input.slice(start, i).trim());
        start = i + delimiter.length;
      }
    } else if (input.slice(i, i + delimiter.length) === delimiter) {
      parts.push(input.slice(start, i).trim());
      start = i + delimiter.length;
    }
  }
  parts.push(input.slice(start).trim());
  return parts.filter(Boolean);
}

function trimOuterParens(input: string): string {
  let out = input;
  while (out.startsWith('(') && out.endsWith(')')) {
    let depth = 0;
    let wraps = true;
    for (let i = 0; i < out.length; i += 1) {
      const ch = out[i]!;
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (depth === 0 && i < out.length - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    out = out.slice(1, -1).trim();
  }
  return out;
}

function extractClause(
  input: string,
  clause: string,
  terminators: string[],
): string | null {
  const lower = input.toLowerCase();
  const start = lower.indexOf(` ${clause} `);
  if (start < 0) return null;
  const contentStart = start + clause.length + 2;
  const end = findNextKeyword(input, contentStart, terminators.map((t) => ` ${t} `));
  return input.slice(contentStart, end ?? undefined).trim();
}

function findNextKeyword(input: string, from: number, keywords: string[]): number | null {
  const lower = input.toLowerCase();
  const hits = keywords
    .map((keyword) => lower.indexOf(keyword, from))
    .filter((idx) => idx >= 0);
  return hits.length > 0 ? Math.min(...hits) : null;
}

function findTopLevelKeyword(input: string, keyword: string): number | null {
  let depth = 0;
  let quote: string | null = null;
  const lower = input.toLowerCase();
  const needle = keyword.toLowerCase();

  for (let i = 0; i <= input.length - needle.length; i += 1) {
    const ch = input[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(') {
      depth += 1;
      continue;
    }
    if (ch === ')') {
      depth -= 1;
      continue;
    }
    if (depth !== 0) continue;

    const before = i === 0 || /\s/.test(input[i - 1]!);
    const after =
      i + needle.length >= input.length ||
      /\s/.test(input[i + needle.length]!);
    if (before && after && lower.slice(i, i + needle.length) === needle) {
      return i;
    }
  }
  return null;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim().replace(/;$/, '');
}

function unquote(value: string): string {
  return value.replace(/^"+|"+$/g, '');
}

function isReadSql(sql: string): boolean {
  const normalized = normalizeSql(sql).toLowerCase();
  return normalized.startsWith('select ') || normalized.startsWith('with recursive ');
}

function isSqlKeyword(value: string): boolean {
  return ['where', 'left', 'inner', 'order', 'limit', 'on'].includes(value.toLowerCase());
}

function makeD1Result<T>(rows: T[], changes: number): D1Result<T> {
  return {
    results: rows,
    success: true,
    meta: {
      served_by: 'hytta-demo-cache',
      duration: 0,
      changes,
      last_row_id: 0,
      changed_db: changes > 0,
      size_after: 0,
      rows_read: rows.length,
      rows_written: changes,
    },
  };
}

function unsupportedSql(sql: string): Error {
  return new Error(`[demo] Unsupported cache SQL: ${sql}`);
}
