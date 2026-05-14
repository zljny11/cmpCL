// @ts-nocheck
const getElementGridIndex = (index: number, column: number): string => {
  const x = (index % column) + 1;
  const y = Math.floor(index / column) + 1;

  return `element${y}_${x}`;
};

export default getElementGridIndex;
