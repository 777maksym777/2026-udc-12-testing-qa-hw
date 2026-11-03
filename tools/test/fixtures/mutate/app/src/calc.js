// Fixture for tools/test/mutate.test.mjs: the tests below kill some mutants and miss others.
export function isAdult(age) {
  return age >= 18;
}

export function total(price, quantity) {
  return price * quantity;
}

export function countdown(n) {
  let steps = 0;
  while (n > 0) {
    n = n - 1;
    steps++;
  }
  return steps;
}
