export const OPTION_LABELS = ["A", "B", "C"];

export function sortBatchOptions(rows) {
  return [...rows].sort((left, right) => OPTION_LABELS.indexOf(left.option_label) - OPTION_LABELS.indexOf(right.option_label));
}

export function batchIsReady(rows) {
  if (!Array.isArray(rows) || rows.length !== OPTION_LABELS.length) return false;
  const sorted = sortBatchOptions(rows);
  return sorted.every((row, index) => row.option_label === OPTION_LABELS[index] && row.review_status === "awaiting_review");
}

export function siblingDropUpdate(publishedOptionLabel) {
  return {
    review_status: "dropped",
    review_note: `Not chosen; ${publishedOptionLabel} was published`,
  };
}
