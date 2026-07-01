import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/students',
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

import { Sidebar } from '@/components/layout/Sidebar';
import { Breadcrumb } from '@/components/layout/Breadcrumb';

describe('Sidebar', () => {
  it('renders navigation sections and marks active route', () => {
    render(<Sidebar />);
    expect(screen.getByLabelText('Primary navigation')).toBeInTheDocument();
    const active = screen.getByRole('link', { name: /students/i });
    expect(active).toHaveAttribute('aria-current', 'page');
  });

  it('respects collapsed state by adding modifier class', () => {
    const { container } = render(<Sidebar collapsed />);
    expect(container.querySelector('.app-sidebar--collapsed')).toBeInTheDocument();
  });
});

describe('Breadcrumb', () => {
  it('renders intermediate links and final crumb without href', () => {
    render(
      <Breadcrumb
        items={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Students', href: '/students' },
          { label: 'John Doe' },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByText('John Doe')).toHaveAttribute('aria-current', 'page');
  });

  it('returns null when items are empty', () => {
    const { container } = render(<Breadcrumb items={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
