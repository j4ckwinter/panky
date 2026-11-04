import { TextField } from "@jack.winter/pancake-ui";
import type { ReactNode } from "react";

type SidebarItem = {
  id: string;
  title: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  action?: ReactNode;
};

export function SidebarList({
  id,
  label,
  searchLabel,
  search,
  onSearch,
  items,
  emptyMessage,
  noMatchesMessage,
}: {
  id: string;
  label: string;
  searchLabel: string;
  search: string;
  onSearch: (value: string) => void;
  items: SidebarItem[];
  emptyMessage: string;
  noMatchesMessage: string;
}) {
  const visibleItems = items.filter((item) =>
    item.title.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <div className="chat-search">
        <TextField
          label={searchLabel}
          placeholder={searchLabel}
          value={search}
          onChange={(event) => onSearch(event.currentTarget.value)}
        />
      </div>
      <nav id={id} className="conversation-list" aria-label={label}>
        {visibleItems.length === 0 && (
          <p className="muted sidebar-empty">
            {items.length === 0 ? emptyMessage : noMatchesMessage}
          </p>
        )}
        {visibleItems.map((item) => (
          <div className="conversation-row" key={item.id}>
            <button
              type="button"
              className="conversation-link"
              aria-current={item.selected ? "page" : undefined}
              disabled={item.disabled}
              onClick={item.onSelect}
            >
              <span>{item.title}</span>
            </button>
            {item.action}
          </div>
        ))}
      </nav>
    </>
  );
}
