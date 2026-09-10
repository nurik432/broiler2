// src/mobile/components/FormField.jsx
export default function FormField({ label, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-tg-hint">{label}</span>
      {children}
    </label>
  );
}
