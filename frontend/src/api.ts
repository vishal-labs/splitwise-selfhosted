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

import { useQuery } from "@tanstack/react-query";

export type User = { id: number; email: string; name: string };

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
  splits: Split[];
};

export const listGroups = () => api<Group[]>("/groups");
export const getGroup = (id: number | string) => api<GroupDetail>(`/groups/${id}`);
export const getGroupExpenses = (id: number | string) => api<Expense[]>(`/groups/${id}/expenses`);
export const getGroupDebts = (id: number | string) => api<Debt[]>(`/groups/${id}/debts`);
export const createGroup = (body: { name: string; currency: string }) =>
  api<Group>("/groups", { body });
export const addMember = (groupId: number | string, email: string) =>
  api(`/groups/${groupId}/members`, { body: { email } });
export const removeMember = (groupId: number | string, userId: number) =>
  api(`/groups/${groupId}/members/${userId}`, { method: "DELETE" });
export const deleteExpense = (id: number) => api(`/expenses/${id}`, { method: "DELETE" });

export const useGroups = () => useQuery({ queryKey: ["groups"], queryFn: listGroups });
export const useGroup = (id: number | string) =>
  useQuery({ queryKey: ["group", id], queryFn: () => getGroup(id) });
export const useGroupExpenses = (id: number | string) =>
  useQuery({ queryKey: ["expenses", id], queryFn: () => getGroupExpenses(id) });
export const useGroupDebts = (id: number | string) =>
  useQuery({ queryKey: ["debts", id], queryFn: () => getGroupDebts(id) });

// --- Task 11: expense create + receipt + settlements (appended to minimize merge conflict) ---

export type SplitInput = {
  user_id: number;
  mode: "equal" | "amounts" | "percent" | "shares";
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
) => api(`/groups/${groupId}/settlements`, { body });

// --- Task 12: analytics + activity (appended to minimize merge conflict) ---

export type Analytics = {
  monthly: { month: string; total: number }[];
  by_category: { category: string; total: number }[];
};

export type ActivityItem = {
  id: number;
  user_id: number;
  user_name: string;
  verb: string;
  target_id: number | null;
  created_at: string;
};

export const getAnalytics = (groupId: number | string, months: number) =>
  api<Analytics>(`/groups/${groupId}/analytics?months=${months}`);
export const getActivity = (groupId: number | string) =>
  api<ActivityItem[]>(`/groups/${groupId}/activity`);

export const useAnalytics = (groupId: number | string, months: number) =>
  useQuery({
    queryKey: ["analytics", groupId, months],
    queryFn: () => getAnalytics(groupId, months),
    enabled: groupId !== 0,
  });
export const useActivity = (groupId: number | string) =>
  useQuery({
    queryKey: ["activity", groupId],
    queryFn: () => getActivity(groupId),
    enabled: groupId !== 0,
  });
