export function SolnSpin({ label }: { label?: string }) {
  return <svg
    viewBox="0 0 16 16"
    className="soln-spin"
    role={label ? 'status' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  ><circle r="7" cy="8" cx="8" /></svg>;
}
