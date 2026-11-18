"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { searchWorkspaceCommands } from "@/lib/workspace/commands";

/**
 * Navigation only: nothing here submits orders, updates account settings,
 * or invokes privileged APIs. Keyboard shortcut: Cmd/Ctrl + K.
 */
export default function WorkspaceQuickSwitch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const matches = useMemo(() => searchWorkspaceCommands(query, 9), [query]);
  const selectedIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));

  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(previous => !previous);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);
    inputRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = oldOverflow; };
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'input:not([disabled]), button:not([disabled]), a[href]'
    );
    if (!focusables?.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="workspaceQuickSwitchTrigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Search workspace tools (⌘K or Ctrl+K)"
      >
        <span aria-hidden="true">⌕</span> Search tools <kbd>⌘/Ctrl K</kbd>
      </button>
      {open && (
        <div className="workspaceQuickSwitchOverlay"
          role="presentation"
          onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspace-quick-switch-title"
            className="workspaceQuickSwitchDialog"
            onKeyDown={onDialogKeyDown}
          >
            <div className="workspaceQuickSwitchHeader">
              <div>
                <p className="workspaceQuickSwitchEyebrow">TRADE SCHEME FX</p>
                <h2 id="workspace-quick-switch-title">Quick Switch</h2>
              </div>
              <button type="button" className="workspaceQuickSwitchClose"
                onClick={close} aria-label="Close Quick Switch">Esc ×</button>
            </div>
            <label htmlFor="workspace-quick-switch-input" className="workspaceQuickSwitchLabel">
              Find a workspace tool
            </label>
            <input
              ref={inputRef}
              id="workspace-quick-switch-input"
              className="workspaceQuickSwitchInput"
              type="search"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={true}
              aria-controls="workspace-quick-switch-results"
              aria-activedescendant={matches.length ? "workspace-quick-switch-result-" + selectedIndex : undefined}
              placeholder="Search charts, bot builder, paper trading, support…"
              value={query}
              onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={event => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  if (matches.length) setActiveIndex(i => (i + 1) % matches.length);
                } else if (event.key === "ArrowUp") {
                  event.preventDefault();
                  if (matches.length) setActiveIndex(i => (i - 1 + matches.length) % matches.length);
                } else if (event.key === "Enter" && matches.length) {
                  event.preventDefault();
                  navigate(matches[selectedIndex].href);
                }
              }}
            />
            <div id="workspace-quick-switch-results" className="workspaceQuickSwitchResults"
              role="listbox" aria-label="Matching workspace tools">
              {matches.map((item, index) => (
                <Link
                  id={"workspace-quick-switch-result-" + index}
                  key={item.id}
                  href={item.href}
                  role="option"
                  aria-selected={index === selectedIndex}
                  className={index === selectedIndex
                    ? "workspaceQuickSwitchOption selected" : "workspaceQuickSwitchOption"}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => setOpen(false)}
                >
                  <span className="workspaceQuickSwitchOptionText">
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                  <span className="workspaceQuickSwitchSection">{item.section}</span>
                </Link>
              ))}
              {matches.length === 0 && <p role="status" className="workspaceQuickSwitchEmpty">
                No matching tool. Try “charts”, “paper”, “bots”, or “support”.
              </p>}
            </div>
            <p className="workspaceQuickSwitchFooter">
              ↑ ↓ to choose · Enter to open · Esc to close
              <span>Navigation only · Does not place trades</span>
            </p>
          </div>
        </div>
      )}
    </>
  );
}
