import React, { useEffect, useMemo, useRef, useState } from 'react';

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
  const availableYears = useMemo(() => (
    [...new Set(optionValues.map((optionValue) => optionValue.slice(0, 4)).filter(Boolean))]
  ), [optionValues.join('|')]);
  const [displayYear, setDisplayYear] = useState(availableYears.at(-1) || '');
  const [draftSelected, setDraftSelected] = useState(selected);
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
  const yearIndex = availableYears.indexOf(displayYear);
  const visibleMonths = options
    .filter((option) => option.value?.startsWith(`${displayYear}-`))
    .sort((a, b) => a.value.localeCompare(b.value));

  function toggleMenu() {
    if (isOpen) {
      setOpenFilter('');
      return;
    }
    const selectedYear = [...selected].sort().at(-1)?.slice(0, 4);
    setDisplayYear(availableYears.includes(selectedYear) ? selectedYear : availableYears.at(-1) || '');
    setDraftSelected(selected);
    setOpenFilter(id);
  }

  function changeMonth(nextValue) {
    onChange(nextValue ? [nextValue] : []);
    setOpenFilter('');
  }

  function selectMonth(nextValue, event) {
    if (event.ctrlKey || event.metaKey) {
      setDraftSelected((current) => (
        current.includes(nextValue)
          ? current.filter((item) => item !== nextValue)
          : [...current, nextValue].sort()
      ));
      return;
    }
    setDraftSelected([nextValue]);
  }

  function confirmMonths() {
    onChange([...draftSelected].sort());
    setOpenFilter('');
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
        onClick={toggleMenu}
      >
        <span className="month-filter-icon" aria-hidden="true">月</span>
        <span className="month-filter-text">{buttonText}</span>
        <span className="month-filter-caret" aria-hidden="true">▾</span>
      </button>
      {isOpen && (
        <div className={`month-filter-menu ${multiple ? 'month-filter-menu-multiple' : ''}`} role="dialog" aria-label={label || allLabel}>
          {multiple ? (
            <>
              <div className="month-filter-year-row">
                <button
                  type="button"
                  className="month-filter-year-button"
                  aria-label="上一年"
                  disabled={yearIndex <= 0}
                  onClick={() => setDisplayYear(availableYears[yearIndex - 1])}
                >
                  ‹
                </button>
                <strong>{displayYear}年</strong>
                <button
                  type="button"
                  className="month-filter-year-button"
                  aria-label="下一年"
                  disabled={yearIndex < 0 || yearIndex >= availableYears.length - 1}
                  onClick={() => setDisplayYear(availableYears[yearIndex + 1])}
                >
                  ›
                </button>
              </div>
              <p className="month-filter-hint">按住 Ctrl 可多选月份</p>
              <div className="month-filter-grid" role="listbox" aria-multiselectable="true">
                {visibleMonths.map((option) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={draftSelected.includes(option.value)}
                    key={option.value}
                    className={`month-filter-month${draftSelected.includes(option.value) ? ' selected' : ''}`}
                    onClick={(event) => selectMonth(option.value, event)}
                  >
                    {Number(option.value.slice(5, 7))}月
                  </button>
                ))}
              </div>
              <div className="month-filter-footer">
                <button
                  type="button"
                  className={`month-filter-all${draftSelected.length === 0 ? ' active' : ''}`}
                  onClick={() => setDraftSelected([])}
                >
                  全部月份
                </button>
                <button type="button" className="month-filter-confirm" onClick={confirmMonths}>确定</button>
              </div>
            </>
          ) : (
            <>
              <div className="month-filter-menu-title">{label}</div>
              <input
                type="month"
                value={value}
                min={min}
                max={max}
                onChange={(event) => changeMonth(event.target.value)}
              />
              <button type="button" className="month-filter-all" onClick={() => changeMonth('')}>
                {allLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
