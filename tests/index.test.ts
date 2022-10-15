import run, { defaultConfig, processSiteData } from "../lambdas/deploy";
import fs from "fs";
import dotenv from "dotenv";
import { test, expect } from "@playwright/test";
dotenv.config();

test.skip("Run Action", async () => {
  test.setTimeout(600000); // 10 min
  await run({
    roamGraph: "roam-depot-developers",
    roamUsername: "support@roamjs.com",
    roamPassword: process.env.ROAM_PASSWORD || "",
  });
});

test.skip("Based on JSON", async () => {
  test.setTimeout(600000);
  const {
    pages,
    config,
    references = [],
  } = JSON.parse(
    fs.readFileSync("../../../Downloads/20211214042331.json").toString()
  );
  await processSiteData({
    pages,
    references,
    config: { ...defaultConfig, ...config },
    deployId: "2021214042331",
    info: console.log,
    outputPath: "out",
  }).then((outConfig) => {
    expect(outConfig).toBeTruthy();
  });
});
