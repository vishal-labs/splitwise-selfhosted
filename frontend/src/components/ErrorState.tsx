import { Button } from "./Button";

type Props = {
  title?: string;
  description?: string;
  /** Retry callback — typically `() => query.refetch()`. */
  action?: () => void;
};

export function ErrorState({ title = "Something went wrong", description, action }: Props) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-destructive/40 px-6 py-10 text-center">
      <h3 className="font-semibold">{title}</h3>
      {description && <p className="max-w-xs text-sm text-muted-fg">{description}</p>}
      {action && (
        <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={action}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
