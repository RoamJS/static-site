import run, { defaultConfig, processSiteData } from "../lambdas/deploy";
import fs from "fs";
import { JSDOM } from "jsdom";
import dotenv from "dotenv";
dotenv.config();

test.skip("Run Action", async (done) => {
  jest.setTimeout(600000); // 10 min
  await run({
    roamGraph: "roam-depot-developers",
    roamUsername: "support@roamjs.com",
    roamPassword: process.env.ROAM_PASSWORD || "",
  })
    .then(() => done())
    .catch(({ message }) => fail(message));
});

test("Based on JSON", () => {
  jest.setTimeout(600000);
  const { pages, config } = JSON.parse(
    fs.readFileSync("../../../Downloads/20210825040834.json").toString()
  );
  const outConfig = processSiteData({
    pages,
    config: { ...defaultConfig, ...config },
    info: console.log,
    outputPath: "out",
    layouts: [],
  });
  expect(outConfig).toBeTruthy();
});
