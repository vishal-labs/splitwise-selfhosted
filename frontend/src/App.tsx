import { Route, Routes } from 'react-router'

// Placeholder pages — real implementations land in Tasks 9–12.
function Placeholder({ name }: { name: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-muted-fg">Coming in a later task.</p>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Dashboard" />} />
      <Route path="/login" element={<Placeholder name="Login" />} />
      <Route path="/register" element={<Placeholder name="Register" />} />
      <Route path="/groups/:id" element={<Placeholder name="Group" />} />
      <Route path="*" element={<Placeholder name="Not found" />} />
    </Routes>
  )
}
