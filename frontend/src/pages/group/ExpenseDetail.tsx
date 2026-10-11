import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import {
  addComment,
  cancelRecurring,
  deleteComment,
  deleteExpense,
  editComment,
  getComments,
  invalidateGroup,
  restoreExpense,
  type Comment,
  type Expense,
  type Member,
} from "../../api";
import { Attachment } from "../../components/Attachment";
import { Avatar } from "../../components/Avatar";
import { Button } from "../../components/Button";
import { CategoryTile } from "../../components/CategoryTile";
import { Dialog } from "../../components/Dialog";
import { NoteIcon, PencilIcon, RepeatIcon, SendIcon, TrashIcon, XIcon } from "../../components/icons";
import { useToast } from "../../components/Toast";
import { categoryFor } from "../../categories";
import { dayLabel, formatMinor, relativeTime } from "../../format";
import { memberName } from "./Feed";

export function ExpenseDetail({
  expense,
  members,
  meId,
  canEdit,
  groupCurrency,
  onEdit,
  onClose,
}: {
  expense: Expense;
  members: Member[];
  meId: number;
  canEdit: boolean;
  groupCurrency: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRule, setConfirmRule] = useState(false);
  const total = expense.converted_amount_minor ?? expense.amount_minor;
  const foreign = expense.currency !== groupCurrency;
  const name = (id: number) => memberName(members, id, meId);

  const del = useMutation({
    mutationFn: () => deleteExpense(expense.id),
    onSuccess: () => {
      invalidateGroup(queryClient, expense.group_id);
      onClose();
      toast(`Deleted “${expense.description}”`, {
        action: {
          label: "Undo",
          run: () =>
            void restoreExpense(expense.id)
              .then(() => {
                invalidateGroup(queryClient, expense.group_id);
                toast("Expense restored");
              })
              .catch(() => toast("Couldn't restore the expense", { tone: "error" })),
        },
      });
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't delete", { tone: "error" }),
  });

  const cancelRule = useMutation({
    mutationFn: () => cancelRecurring(expense.group_id, expense.recurring_rule_id!),
    onSuccess: () => {
      invalidateGroup(queryClient, expense.group_id);
      setConfirmRule(false);
      toast("Recurring expense stopped");
    },
  });

  return (
    <Dialog
      open
      onClose={onClose}
      title={expense.description}
      bare
      width="30rem"
      bodyClassName="px-5 pb-6 max-sm:px-4"
      footer={
        canEdit &&
        (confirmDelete ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm">Delete this expense?</p>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" disabled={del.isPending} onClick={() => del.mutate()}>
              {del.isPending ? "Deleting…" : "Delete"}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={onEdit}>
              <PencilIcon size={16} /> Edit
            </Button>
            <Button variant="secondary" size="icon" className="h-11 w-11 text-destructive" aria-label="Delete expense" onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={18} />
            </Button>
          </div>
        ))
      }
    >
      <div className="flex items-start gap-3 pt-3">
        <CategoryTile category={expense.category} size={52} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-snug">{expense.description}</h2>
          <p className="text-sm text-muted-fg">
            {categoryFor(expense.category).name} · {dayLabel(expense.date)}
          </p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Close" className="-mr-2 -mt-1 text-muted-fg" onClick={onClose}>
          <XIcon size={20} />
        </Button>
      </div>

      <p className="tabular mt-5 text-[2.5rem] font-bold leading-none tracking-tight">{formatMinor(expense.amount_minor, expense.currency)}</p>
      {foreign && (
        <p className="tabular mt-1.5 text-sm text-muted-fg">
          = {formatMinor(total, groupCurrency)} at {expense.rate?.toFixed(4)} {groupCurrency}/{expense.currency}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-fg">
        Added by {name(expense.created_by)}
        {expense.created_at ? ` ${relativeTime(expense.created_at)}` : ""}
      </p>

      {expense.recurring_rule_id != null && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary-soft px-3.5 py-2.5 text-sm text-primary-soft-fg">
          <RepeatIcon size={18} />
          <span className="flex-1 font-medium">Repeats automatically</span>
          {canEdit &&
            (confirmRule ? (
              <span className="flex gap-1">
                <button type="button" className="h-8 cursor-pointer rounded-full px-2.5 font-semibold" onClick={() => setConfirmRule(false)}>
                  Keep
                </button>
                <button
                  type="button"
                  className="h-8 cursor-pointer rounded-full bg-destructive px-3 font-semibold text-destructive-fg"
                  disabled={cancelRule.isPending}
                  onClick={() => cancelRule.mutate()}
                >
                  Stop
                </button>
              </span>
            ) : (
              <button type="button" className="h-8 cursor-pointer rounded-full px-2.5 font-semibold underline" onClick={() => setConfirmRule(true)}>
                Stop repeating
              </button>
            ))}
        </div>
      )}

      {expense.notes && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-muted px-3.5 py-3 text-sm">
          <NoteIcon size={18} className="mt-0.5 shrink-0 text-muted-fg" />
          <p className="whitespace-pre-wrap">{expense.notes}</p>
        </div>
      )}

      <section className="mt-5">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-fg">Split</h3>
        <ul className="divide-y divide-border rounded-2xl border border-border">
          <li className="flex items-center gap-3 px-3.5 py-2.5">
            <Avatar name={memberName(members, expense.payer_id)} size={32} />
            <span className="min-w-0 flex-1 truncate">
              <strong className="font-semibold">{name(expense.payer_id)}</strong> paid
            </span>
            <span className="tabular font-semibold">{formatMinor(total, groupCurrency)}</span>
          </li>
          {expense.splits.map((s) => (
            <li key={s.user_id} className="flex items-center gap-3 px-3.5 py-2.5 pl-8">
              <Avatar name={memberName(members, s.user_id)} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {s.user_id === expense.payer_id
                  ? `${s.user_id === meId ? "Your" : `${name(s.user_id)}'s`} share`
                  : `${name(s.user_id)} ${s.user_id === meId ? "owe" : "owes"}`}
              </span>
              <span className="tabular text-sm font-medium">{formatMinor(s.amount_minor, groupCurrency)}</span>
            </li>
          ))}
        </ul>
      </section>

      {expense.receipt_path && (
        <section className="mt-5 grid gap-2 text-sm">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Receipt</h3>
          <Attachment url={`/api/expenses/${expense.id}/receipt`} path={expense.receipt_path} alt="Receipt" linkLabel="Open receipt (PDF)" />
        </section>
      )}

      <Comments expenseId={expense.id} members={members} meId={meId} />
    </Dialog>
  );
}

function Comments({ expenseId, members, meId }: { expenseId: number; members: Member[]; meId: number }) {
  const queryClient = useQueryClient();
  const { data: comments, isPending } = useQuery({ queryKey: ["comments", expenseId], queryFn: () => getComments(expenseId) });
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["comments", expenseId] });

  const add = useMutation({
    mutationFn: () => addComment(expenseId, body.trim()),
    onSuccess: () => {
      refresh();
      setBody("");
      setError("");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Something went wrong"),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (body.trim()) add.mutate();
  }

  return (
    <section className="mt-6 grid gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-fg">Comments</h3>
      {isPending ? (
        <div className="skeleton h-12" />
      ) : comments && comments.length > 0 ? (
        <ul className="grid gap-3">
          {comments.map((c) => (
            <CommentItem key={c.id} comment={c} expenseId={expenseId} author={memberName(members, c.user_id)} mine={c.user_id === meId} onChanged={refresh} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-fg">No comments yet.</p>
      )}
      <form onSubmit={onSubmit} className="flex items-center gap-2">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a comment…"
          maxLength={2000}
          aria-label="Add a comment"
          className="h-11 min-w-0 flex-1 rounded-full border border-border bg-card px-4 text-[0.9375rem] placeholder:text-muted-fg/80 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
        />
        <Button type="submit" size="icon" className="h-11 w-11" aria-label="Post comment" disabled={add.isPending || !body.trim()}>
          <SendIcon size={18} />
        </Button>
      </form>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}

/** One comment bubble; the author can edit it inline or delete it (with a confirm step). */
function CommentItem({ comment: c, expenseId, author, mine, onChanged }: { comment: Comment; expenseId: number; author: string; mine: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () => editComment(expenseId, c.id, draft.trim()),
    onSuccess: () => {
      onChanged();
      setEditing(false);
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't save the comment", { tone: "error" }),
  });
  const remove = useMutation({
    mutationFn: () => deleteComment(expenseId, c.id),
    onSuccess: () => {
      onChanged();
      toast("Comment deleted");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Couldn't delete the comment", { tone: "error" }),
  });

  return (
    <li className="flex gap-2.5">
      <Avatar name={author} size={28} />
      <div className="min-w-0 flex-1">
        {editing ? (
          <form
            className="grid gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.trim() && draft.trim() !== c.body) save.mutate();
              else setEditing(false);
            }}
          >
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={2}
              autoFocus
              aria-label="Edit comment"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation(); // don't close the whole sheet
                  e.preventDefault();
                  setEditing(false);
                  setDraft(c.body);
                }
              }}
              className="w-full resize-none rounded-2xl border border-primary bg-card px-3.5 py-2 text-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
            />
            <div className="flex justify-end gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setDraft(c.body);
                }}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!draft.trim() || save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        ) : (
          <div className="rounded-2xl rounded-tl-md bg-muted px-3.5 py-2 text-sm">
            <p className="text-xs font-semibold">{mine ? "You" : author}</p>
            <p className="whitespace-pre-wrap break-words">{c.body}</p>
          </div>
        )}
        {!editing && (
          <p className="mt-1 flex items-center gap-1 pl-1 text-xs text-muted-fg">
            <span className="mr-1">
              {relativeTime(c.created_at)}
              {c.updated_at && " · edited"}
            </span>
            {mine &&
              (confirmDelete ? (
                <>
                  <span className="font-medium text-fg">Delete?</span>
                  <button type="button" className="h-7 cursor-pointer rounded-full px-2 font-semibold text-destructive hover:bg-destructive/10" disabled={remove.isPending} onClick={() => remove.mutate()}>
                    Yes, delete
                  </button>
                  <button type="button" className="h-7 cursor-pointer rounded-full px-2 font-medium hover:bg-muted" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="h-7 cursor-pointer rounded-full px-2 font-medium hover:bg-muted hover:text-fg" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  <button type="button" className="h-7 cursor-pointer rounded-full px-2 font-medium hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                </>
              ))}
          </p>
        )}
      </div>
    </li>
  );
}
