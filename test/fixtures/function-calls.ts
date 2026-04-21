/**
 * Test fixture: Functions calling other functions.
 */
function greet(name: string): string {
  return `Hello, ${name}!`;
}

function welcome(name: string): void {
  const message = greet(name);
  console.log(message);
}

export const run = () => {
  welcome('World');
};
