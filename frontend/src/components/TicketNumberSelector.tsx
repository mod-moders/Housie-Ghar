"use client";

import { useMemo } from "react";
import { Icon } from "./Icon";

export interface TicketNumber {
  number: number;
  status: "available" | "locked" | "sold";
  ticketId?: number;
}

interface TicketNumberSelectorProps {
  numbers: TicketNumber[];
  selected: number[];
  onSelect: (numbers: number[]) => void;
  maxSelection?: number;
  gameTitle?: string;
  ticketPrice?: number;
  columns?: number;
  showTotal?: boolean;
  onBookNow?: () => void;
  canBook?: boolean;
  booking?: boolean;
}

const DEFAULT_COLUMNS = 6;

export function TicketNumberSelector({
  numbers,
  selected,
  onSelect,
  maxSelection = 30,
  gameTitle,
  ticketPrice = 0,
  columns = DEFAULT_COLUMNS,
  showTotal = true,
  onBookNow,
  canBook = false,
  booking = false,
}: TicketNumberSelectorProps) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const availableCount = numbers.filter((n) => n.status === "available").length;
  const lockedCount = numbers.filter((n) => n.status === "locked").length;
  const soldCount = numbers.filter((n) => n.status === "sold").length;
  const total = selected.length * ticketPrice;

  const handleToggle = (num: number) => {
    const ticket = numbers.find((n) => n.number === num);
    if (!ticket || ticket.status !== "available") return;

    if (selectedSet.has(num)) {
      onSelect(selected.filter((x) => x !== num));
    } else if (selected.length < maxSelection) {
      onSelect([...selected, num].sort((a, b) => a - b));
    }
  };

  const clearAll = () => onSelect([]);

  const selectedNumbers = useMemo(() => selected.slice().sort((a, b) => a - b), [selected]);

  return (
    <div
      className="hg-ticket-selector"
      data-ticket-count={numbers.length}
      style={{ "--cols": columns } as React.CSSProperties}
    >
      {gameTitle && (
        <div className="hg-ticket-selector-header">
          <h3 className="hg-ticket-selector-title">{gameTitle}</h3>
          <div className="hg-ticket-selector-legend">
            <span className="hg-legend-item available">
              <i className="hg-legend-dot" />
              Available: {availableCount}
            </span>
            <span className="hg-legend-item locked">
              <i className="hg-legend-dot" />
              Locked: {lockedCount}
            </span>
            <span className="hg-legend-item sold">
              <i className="hg-legend-dot" />
              Sold: {soldCount}
            </span>
          </div>
        </div>
      )}

      <div className="hg-number-grid">
        {numbers.map((ticket) => {
          const isSelected = selectedSet.has(ticket.number);
          const isDisabled = ticket.status !== "available";
          const className = `hg-num-btn ${isSelected ? "selected" : ""} ${ticket.status} ${isDisabled ? "disabled" : ""}`;

          return (
            <button
              key={ticket.number}
              className={className}
              onClick={() => handleToggle(ticket.number)}
              disabled={isDisabled}
              aria-label={`Ticket ${ticket.number} ${ticket.status}${isSelected ? " selected" : ""}`}
              aria-pressed={isSelected}
            >
              {ticket.status === "locked" && <Icon name="lock" size={11} strokeWidth={2.5} />}
              {ticket.status === "sold" && <Icon name="x" size={11} strokeWidth={2.8} />}
              <span className="hg-num-btn-text">{ticket.number}</span>
              {isSelected && <Icon name="check" size={11} strokeWidth={3} className="hg-num-btn-check" />}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <div className="hg-selected-summary">
          <div className="hg-selected-chips">
            {selectedNumbers.map((n) => (
              <span key={n} className="hg-selected-chip">
                {n}
                <button
                  type="button"
                  className="hg-chip-remove"
                  onClick={() => handleToggle(n)}
                  aria-label={`Remove ticket ${n}`}
                >
                  <Icon name="x" size={10} strokeWidth={2.5} />
                </button>
              </span>
            ))}
            {selected.length > 1 && (
              <button type="button" className="hg-clear-btn" onClick={clearAll}>
                <Icon name="trash" size={11} strokeWidth={2} />
                Clear all
              </button>
            )}
          </div>
          {showTotal && ticketPrice > 0 && (
            <div className="hg-selected-total">
              <span>{selected.length} ticket{selected.length > 1 ? "s" : ""} × ₹{ticketPrice}</span>
              <strong>₹{total}</strong>
            </div>
          )}
        </div>
      )}

      {onBookNow && (
        <button
          className="hg-book-now-btn"
          onClick={onBookNow}
          disabled={!canBook || booking}
          type="button"
        >
          {booking ? (
            <>
              <span className="hg-spinner" />
              Reserving...
            </>
          ) : (
            <>
              <Icon name="ticket" size={16} strokeWidth={2.2} />
              Book Now
            </>
          )}
        </button>
      )}
    </div>
  );
}