/** Typed fetch wrapper for the backend API. Cookie-session auth, JSON in/out. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  /** Sent as JSON body. */
  body?: unknown;
  /** Sent as multipart/form-data (e.g. receipt upload). */
  form?: FormData;
};

export async function api<T>(path: string, opts: Opts = {}): Promise<T> {
  const { method = opts.body ? "POST" : "GET", body, form } = opts;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "include",
    headers: form ? undefined : body ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    // Session expired mid-use: clear in-memory state by reloading into /login.
    // Auth endpoints are excluded so Login/Register/me can still see their own 401s.
    if (
      res.status === 401 &&
      !path.startsWith("/users/login") &&
      !path.startsWith("/users/register") &&
      !path.startsWith("/users/me")
    ) {
      location.href = "/login";
      throw new ApiError(401, "Session expired");
    }
    let message = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) message = data.detail;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

import { useQuery, type QueryClient } from "@tanstack/react-query";

export type User = {
  id: number;
  email: string;
  name: string;
  upi_id: string | null;
  has_upi_qr: boolean;
  /** Invited by email, hasn't registered yet. */
  pending?: boolean;
};

/** Current session; null when logged out (401). */
export async function getMe(): Promise<User | null> {
  try {
    return await api<User>("/users/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

// --- Groups ---

export type Group = {
  id: number;
  name: string;
  currency: string;
  created_by: number;
  invite_code: string;
  member_count: number;
  simplify_debts: boolean;
};

export type Member = User & { role: string };

export type GroupDetail = Group & { members: Member[] };

export type Debt = { from: number; to: number; amount: number };

export type Split = { user_id: number; amount_minor: number };

export type Expense = {
  id: number;
  group_id: number;
  created_by: number;
  payer_id: number;
  description: string;
  amount_minor: number;
  currency: string;
  converted_amount_minor: number | null;
  rate: number | null;
  date: string;
  category: string | null;
  recurring_rule_id: number | null;
  receipt_path: string | null;
  notes: string | null;
  created_at: string | null;
  splits: Split[];
};

export const listGroups = () => api<Group[]>("/groups");
export const getGroup = (id: number | string) => api<GroupDetail>(`/groups/${id}`);
export const getGroupExpenses = (id: number | string) => api<Expense[]>(`/groups/${id}/expenses`);
export const getGroupDebts = (id: number | string) => api<Debt[]>(`/groups/${id}/debts`);
export const createGroup = (body: { name: string; currency: string }) =>
  api<Group>("/groups", { body });
/** `name` set = invite: an unregistered email becomes a pending member. */
export const addMember = (groupId: number | string, email: string, name?: string) =>
  api<Member & { pending: boolean }>(`/groups/${groupId}/members`, {
    body: name ? { email, name } : { email },
  });
export const updateGroup = (id: number | string, body: { name?: string; simplify_debts?: boolean }) =>
  api<Group>(`/groups/${id}`, { method: "PATCH", body });
export const restoreExpense = (id: number) =>
  api<Expense>(`/expenses/${id}/restore`, { method: "POST" });
export const removeMember = (groupId: number | string, userId: number) =>
  api(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
export const deleteExpense = (id: number) => api(`/expenses/${id}`, { method: "DELETE" });
export const updateExpense = (
  id: number,
  body: {
    description: string;
    amount_minor: number;
    currency: string;
    payer_id: number;
    splits: SplitInput[];
    date?: string;
    category?: string;
    notes?: string | null;
  },
) => api<Expense>(`/expenses/${id}`, { method: "PATCH", body });
export const joinGroup = (code: string) => api<Group>(`/groups/join/${code}`, { method: "POST" });

// --- Comments ---

export type Comment = { id: number; user_id: number; body: string; created_at: string; updated_at: string | null };

export const getComments = (expenseId: number) => api<Comment[]>(`/expenses/${expenseId}/comments`);
export const addComment = (expenseId: number, body: string) =>
  api<Comment>(`/expenses/${expenseId}/comments`, { body: { body } });
export const editComment = (expenseId: number, commentId: number, body: string) =>
  api<Comment>(`/expenses/${expenseId}/comments/${commentId}`, { method: "PATCH", body: { body } });
export const deleteComment = (expenseId: number, commentId: number) =>
  api<{ ok: boolean }>(`/expenses/${expenseId}/comments/${commentId}`, { method: "DELETE" });

export const useGroups = () => useQuery({ queryKey: ["groups"], queryFn: listGroups });
export const useGroup = (id: number | string) =>
  useQuery({ queryKey: ["group", String(id)], queryFn: () => getGroup(id), enabled: id !== "" });
export const useGroupExpenses = (id: number | string) =>
  useQuery({ queryKey: ["expenses", String(id)], queryFn: () => getGroupExpenses(id) });
export const useGroupDebts = (id: number | string) =>
  useQuery({ queryKey: ["debts", String(id)], queryFn: () => getGroupDebts(id) });

// --- Task 11: expense create + receipt + settlements (appended to minimize merge conflict) ---

export type SplitInput = {
  user_id: number;
  /** itemized: value = that person's items (minor units); the rest of the total is shared equally. */
  mode: "equal" | "amounts" | "percent" | "shares" | "itemized";
  value?: number | null;
};

export const createExpense = (
  groupId: number | string,
  body: {
    description: string;
    amount_minor: number;
    currency: string;
    payer_id: number;
    splits: SplitInput[];
    date?: string;
    category?: string;
    notes?: string | null;
    recurring?: { freq: "weekly" | "monthly" | "yearly"; day: number };
  },
) => api<Expense>(`/groups/${groupId}/expenses`, { body });

export const uploadReceipt = (expenseId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<{ receipt_path: string }>(`/expenses/${expenseId}/receipt`, {
    method: "POST",
    form,
  });
};

export const createSettlement = (
  groupId: number | string,
  body: { payer_id: number; payee_id: number; amount_minor: number; currency: string },
): Promise<Settlement> => api(`/groups/${groupId}/settlements`, { body });

export const cancelRecurring = (groupId: number | string, ruleId: number) =>
  api(`/groups/${groupId}/recurring/${ruleId}`, { method: "DELETE" });

// --- Task 12: analytics + activity (appended to minimize merge conflict) ---

export type Analytics = {
  monthly: { month: string; total: number }[];
  by_category: { category: string; total: number }[];
  summary: { total: number; you_paid: number; your_share: number };
};

export type ActivityItem = {
  id: number;
  user_id: number;
  user_name: string;
  group_id: number;
  group_name: string;
  verb: string;
  target_id: number | null;
  detail: { description: string; amount: number; currency: string } | null;
  created_at: string;
};

export const getAnalytics = (groupId: number | string, months: number) =>
  api<Analytics>(`/groups/${groupId}/analytics?months=${months}`);
export const getActivity = (groupId: number | string) =>
  api<ActivityItem[]>(`/groups/${groupId}/activity`);

export const useAnalytics = (groupId: number | string, months: number) =>
  useQuery({
    queryKey: ["analytics", String(groupId), months],
    queryFn: () => getAnalytics(groupId, months),
    enabled: groupId !== 0,
  });
export const useActivity = (groupId: number | string) =>
  useQuery({
    queryKey: ["activity", String(groupId)],
    queryFn: () => getActivity(groupId),
    enabled: groupId !== 0,
  });

export const deleteGroup = (id: number | string) =>
  api<{ ok: boolean }>(`/groups/${id}`, { method: "DELETE" });

// --- UPI payments (appended to minimize merge conflict) ---

export const updateMe = (body: { name?: string; email?: string; upi_id?: string | null }) =>
  api<User>("/users/me", { method: "PATCH", body });

export const uploadUpiQr = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<{ has_upi_qr: boolean }>("/users/me/upi-qr", { method: "POST", form });
};

export const deleteUpiQr = () => api<{ ok: boolean }>("/users/me/upi-qr", { method: "DELETE" });

export const upiQrUrl = (userId: number) => `/api/users/${userId}/upi-qr`;

// --- Profile + password (appended to minimize merge conflict) ---

export const changePassword = (body: { current_password: string; new_password: string }) =>
  api<void>("/users/me/password", { method: "POST", body });

// --- Settlement proof (appended to minimize merge conflict) ---

export type Settlement = {
  id: number;
  group_id: number;
  payer_id: number;
  payee_id: number;
  amount_minor: number;
  currency: string;
  rate: number | null;
  date: string;
  proof_path: string | null;
  /** Waiting for the payee to confirm; deletable until then. */
  pending: boolean;
  created_by: number | null;
  confirmed_at: string | null;
};

/** A payment someone recorded to you that you haven't confirmed yet. */
export type PendingSettlement = Settlement & { group_name: string; group_currency: string; payer_name: string };

export const confirmSettlement = (id: number) => api<Settlement>(`/settlements/${id}/confirm`, { method: "POST" });
export const deleteSettlement = (id: number) => api<{ ok: boolean }>(`/settlements/${id}`, { method: "DELETE" });
export const usePendingSettlements = () =>
  useQuery({ queryKey: ["settlements", "pending"], queryFn: () => api<PendingSettlement[]>("/settlements/pending") });

export const uploadSettlementProof = (settlementId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api<{ proof_path: string }>(`/settlements/${settlementId}/proof`, {
    method: "POST",
    form,
  });
};

export const settlementProofUrl = (id: number) => `/api/settlements/${id}/proof`;

export const getGroupSettlements = (id: number | string) =>
  api<Settlement[]>(`/groups/${id}/settlements`);

export const useGroupSettlements = (id: number | string) =>
  useQuery({ queryKey: ["settlements", String(id)], queryFn: () => getGroupSettlements(id) });

// --- Friends (cross-group balances) + global activity ---

/** Positive amount = they owe you. */
export type FriendBalance = { currency: string; amount: number };
export type Friend = User & {
  pending: boolean;
  balances: FriendBalance[];
  groups: { group_id: number; group_name: string; currency: string; amount: number }[];
};

export const getFriends = () => api<Friend[]>("/friends");
export const useFriends = () => useQuery({ queryKey: ["friends"], queryFn: getFriends });

export const getMyActivity = () => api<ActivityItem[]>("/activity");
export const useMyActivity = () => useQuery({ queryKey: ["activity", "all"], queryFn: getMyActivity });

/** Refetch everything a money change in `groupId` can affect. Route params are
 *  strings and query keys must match exactly, so ids are normalised here. */
export function invalidateGroup(queryClient: QueryClient, groupId: number | string) {
  const id = String(groupId);
  for (const key of ["expenses", "debts", "settlements", "group", "analytics"])
    queryClient.invalidateQueries({ queryKey: [key, id] });
  queryClient.invalidateQueries({ queryKey: ["friends"] });
  queryClient.invalidateQueries({ queryKey: ["activity"] });
  queryClient.invalidateQueries({ queryKey: ["groups"] });
  queryClient.invalidateQueries({ queryKey: ["settlements", "pending"] });
}
