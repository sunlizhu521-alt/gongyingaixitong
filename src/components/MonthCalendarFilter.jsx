import React, { useEffect, useRef } from 'react';

export default function MonthCalendarFilter({
  id,
  label,
  allLabel,
  options = [],
  selected = [],
  multiple = false,
  onChange,
  openFilter,
  setOpenFilter
}) {
  const isOpen = openFilter === id;
  const rootRef = useRef(null);
  const optionValues = options.map((option) => option.value).filter(Boolean).sort();
  const value = selected[0] || '';
  const selectedLabels = selected
    .map((selectedValue) => options.find((option) => option.value === selectedValue)?.label || selectedValue)
    .filter(Boolean);
  const buttonText = selectedLabels.length === 0
    ? allLabel
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `已选${selectedLabels.length}个月`;
  const min = optionValues[0] || '';
  const max = optionValues[optionValues.length - 1] || '';

  function changeMonth(nextValue) {
    onChange(nextValue ? [nextValue] : []);
    setOpenFilter('');
  }

  function toggleMonth(nextValue) {
    onChange(selected.includes(nextValue)
      ? selected.filter((item) => item !== nextValue)
      : [...selected, nextValue].sort());
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutsidePointer(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpenFilter('');
      }
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isOpen, setOpenFilter]);

  return (
    <div className="month-calendar-filter" ref={rootRef}>
      <button
        type="button"
        className="month-filter-trigger"
        aria-label={label || allLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setOpenFilter(isOpen ? '' : id)}
      >
        <span className="month-filter-icon" aria-hidden="true">月</span>
        <span className="month-filter-text">{buttonText}</span>
        <span className="month-filter-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className="month-filter-menu" role="dialog" aria-label={label || allLabel}>
          <div className="month-filter-menu-title">{label}</div>
          {multiple ? (
            <div className="month-filter-options" role="listbox" aria-multiselectable="true">
              {options.map((option) => (
                <label key={option.value} className="month-filter-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(option.value)}
                    onChange={() => toggleMonth(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          ) : (
            <input
              type="month"
              value={value}
              min={min}
              max={max}
              onChange={(event) => changeMonth(event.target.value)}
            />
          )}
          <button type="button" className="month-filter-all" onClick={() => multiple ? onChange([]) : changeMonth('')}>
            {allLabel}
          </button>
        </div>
      )}
    </div>
  );
}
