import React, { useState, ReactNode } from 'react';

interface LazyDetailsProps {
  className?: string;
  summary: ReactNode;
  children: ReactNode;
}

export const LazyDetails: React.FC<LazyDetailsProps> = ({ summary, children, className }) => {
  const [hasOpened, setHasOpened] = useState(false);

  // ⚡ Bolt: Defer rendering children of details elements until expanded.
  // This optimization avoids unconditionally mounting heavy components and
  // triggering expensive network requests on initial page load, while
  // preserving component state if toggled closed later.
  return (
    <details className={className}
      onToggle={(e) => {
        if (e.currentTarget.open && !hasOpened) {
          setHasOpened(true);
        }
      }}
    >
      <summary>{summary}</summary>
      {hasOpened && children}
    </details>
  );
};
