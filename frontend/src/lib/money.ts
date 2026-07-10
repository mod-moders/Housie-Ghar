import React from "react";

export function money(n: number): React.ReactNode {
  return React.createElement(
    React.Fragment,
    null,
    React.createElement("span", { className: "rupee" }, "₹"),
    Math.round(n).toLocaleString("en-IN")
  );
}

export function moneyStr(n: number): string {
  return "₹" + Math.round(n).toLocaleString("en-IN");
}
