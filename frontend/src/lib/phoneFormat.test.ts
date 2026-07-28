import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePhone, formatPhone } from "./phoneFormat.ts";

// A small fixed list keeps these tests independent of the real country data.
const DIALS = ["+91", "+977", "+1", "+1876", "+44", "+971", "+7"];
const DEFAULT = "+91";

test("a legacy bare national number keeps its digits and defaults to +91", () => {
  assert.deepEqual(parsePhone("9876543210", DIALS, DEFAULT), { dial: "+91", national: "9876543210" });
});

test("an empty value defaults to +91 with no national part", () => {
  assert.deepEqual(parsePhone("", DIALS, DEFAULT), { dial: "+91", national: "" });
});

test("an E.164 value splits into dial code and national part", () => {
  assert.deepEqual(parsePhone("+919876543210", DIALS, DEFAULT), { dial: "+91", national: "9876543210" });
});

test("longest-prefix wins: +977 is Nepal, not +91 followed by digits", () => {
  assert.deepEqual(parsePhone("+9779812345678", DIALS, DEFAULT), { dial: "+977", national: "9812345678" });
});

test("longest-prefix wins: +1876 is Jamaica, not +1 followed by 876", () => {
  assert.deepEqual(parsePhone("+18765551234", DIALS, DEFAULT), { dial: "+1876", national: "5551234" });
});

test("a shared dial code resolves to a single definite value", () => {
  // +1 is used by the US, Canada and others. Parsing must land on exactly one
  // dial code so the select always has a definite selection.
  assert.equal(parsePhone("+15551234567", DIALS, DEFAULT).dial, "+1");
});

test("an unrecognised dial code falls back to the default", () => {
  assert.deepEqual(parsePhone("+9995551234", DIALS, DEFAULT), { dial: "+91", national: "9995551234" });
});

test("formatting joins the two parts into E.164", () => {
  assert.equal(formatPhone("+91", "9876543210"), "+919876543210");
});

test("an empty national part formats to an empty string, NOT the bare dial code", () => {
  // Load-bearing: BookieApplicationModal and FirstTimeSetup both gate submission
  // on `if (!form.phone.trim())`. Returning "+91" here is truthy and would let a
  // bookie application through with no phone number at all.
  assert.equal(formatPhone("+91", ""), "");
  assert.equal(formatPhone("+91", "   "), "");
});

test("non-digits are stripped from the national part when formatting", () => {
  assert.equal(formatPhone("+91", "98765 43210"), "+919876543210");
  assert.equal(formatPhone("+91", "(98765)-43210"), "+919876543210");
});

test("parse then format round-trips an E.164 value unchanged", () => {
  const input = "+971501234567";
  const { dial, national } = parsePhone(input, DIALS, DEFAULT);
  assert.equal(formatPhone(dial, national), input);
});
