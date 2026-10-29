import type { JSX, ReactNode } from 'react';

type AppLayoutProps = {
  menu: ReactNode;
  control: ReactNode;
  canvas: ReactNode;
};

export function AppLayout({ menu, control, canvas }: AppLayoutProps): JSX.Element {
  return (
    <section className="mrp-workspace">
      <aside className="mrp-column mrp-column--menu">{menu}</aside>
      <section className="mrp-column mrp-column--control">{control}</section>
      <section className="mrp-column mrp-column--canvas">{canvas}</section>
    </section>
  );
}
