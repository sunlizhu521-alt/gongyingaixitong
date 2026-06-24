import React from 'react';

function MultiFilter({ id, label, allLabel, options, selected, onChange, openFilter, setOpenFilter }) {
  const isOpen = openFilter === id;
  const selectedLabels = selected
    .map((value) => options.find((option) => option.value === value)?.label || value)
    .filter(Boolean);
  const buttonText = selectedLabels.length === 0
    ? allLabel
    : selectedLabels.length <= 2
      ? selectedLabels.join('、')
      : `已选${selectedLabels.length}项`;

  function toggle(value) {
    if (selected.includes(value)) {
      onChange(selected.filter((item) => item !== value));
    } else {
      onChange([...selected, value]);
    }
  }

  return (
    <div className="multi-filter">
      <button
        type="button"
        className="multi-filter-button"
        aria-label={label}
        onClick={() => setOpenFilter(isOpen ? '' : id)}
      >
        {buttonText}
      </button>
      {isOpen && (
        <div className="multi-filter-menu">
          <label>
            <input type="checkbox" checked={selected.length === 0} onChange={() => onChange([])} />
            全部
          </label>
          {options.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export default MultiFilter;
