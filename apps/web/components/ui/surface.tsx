import type { ReactNode } from "react";

type SurfaceProps = {
  children: ReactNode;
  eyebrow?: string;
  title: string;
};

export function Surface({ children, eyebrow, title }: SurfaceProps) {
  return (
    <section className="surface">
      {eyebrow ? <p className="surface__eyebrow">{eyebrow}</p> : null}
      <h2 className="surface__title">{title}</h2>
      {children}
    </section>
  );
}
