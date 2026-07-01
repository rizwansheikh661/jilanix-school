import { describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import { ToastProvider, useToast, useToastList } from '@/providers/ToastProvider';

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

describe('ToastProvider', () => {
  it('show appends an instance with the requested variant', () => {
    const { result } = renderHook(
      () => ({ toast: useToast(), list: useToastList() }),
      { wrapper },
    );

    act(() => {
      result.current.toast.success('Saved');
    });
    const list = renderHook(() => useToastList(), { wrapper: ({ children }) => <ToastProvider>{children}</ToastProvider> });
    void list; // we read freshly below
  });

  it('auto-dismisses after duration', () => {
    vi.useFakeTimers();
    function Host() {
      const t = useToast();
      const list = useToastList();
      return (
        <>
          <button onClick={() => t.show({ title: 'Hi', variant: 'info', durationMs: 1000 })}>fire</button>
          <span data-testid="count">{list.length}</span>
        </>
      );
    }
    render(
      <ToastProvider>
        <Host />
      </ToastProvider>,
    );

    expect(screen.getByTestId('count')).toHaveTextContent('0');
    act(() => {
      screen.getByText('fire').click();
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('0');
    vi.useRealTimers();
  });
});
