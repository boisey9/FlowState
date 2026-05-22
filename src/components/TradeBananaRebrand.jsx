import { useEffect } from "react";

const replacements = [
  ["FlowState Prototype", "Trade Banana"],
  ["Probability-first trading cockpit", "Trade Banana"],
  ["FlowState measures the current market regime, checks whether that regime tends to continue, and separates market context from trade execution.", "Peel back the charts. Find the good stuff."],
  ["FlowState only provides decision support. It does not place trades or connect to a broker.", "Trade Banana only provides decision support. It does not place trades or connect to a broker."],
  ["Use FlowState as a second opinion before trading. Final trade decisions and risk remain your responsibility.", "Use Trade Banana as a second opinion before trading. Final trade decisions and risk remain your responsibility."],
  ["FlowState says", "Trade Banana says"],
  ["FlowState gives context", "Trade Banana gives context"],
  ["FlowState does not see", "Trade Banana does not see"],
  ["FlowState blocks", "Trade Banana blocks"],
  ["FlowState", "Trade Banana"],
];

function replaceTextContent(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  nodes.forEach((node) => {
    let text = node.nodeValue;
    replacements.forEach(([from, to]) => {
      text = text.split(from).join(to);
    });
    node.nodeValue = text;
  });

  document.title = "Trade Banana";
}

export default function TradeBananaRebrand() {
  useEffect(() => {
    replaceTextContent();
    const observer = new MutationObserver(() => replaceTextContent());
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
