import assert from "node:assert";
import { parseContent, parseInput, parseLine } from "../src/parser.ts";
import { buildOmpAuthDoc } from "../src/importer.ts";

function runTests() {
  console.log("🧪 Running omp-antigravity-auth parser tests...\n");

  // Test 1: Antigravity Manager JSON array format
  {
    const jsonInput = JSON.stringify([
      {
        email: "antigravity.test1@gmail.com",
        refresh_token: "1//0mock_test_token_alpha_1234567890abcdefghijklmnopqrstuvwxyz"
      },
      {
        email: "antigravity.test2@gmail.com",
        refresh_token: "1//0mock_test_token_beta_0987654321zyxwvutsrqponmlkjihgfedcba"
      }
    ]);

    const result = parseContent(jsonInput);
    assert.strictEqual(result.accounts.length, 2, "Should parse 2 accounts from JSON array");
    assert.strictEqual(result.accounts[0].email, "antigravity.test1@gmail.com");
    assert.strictEqual(result.accounts[0].refreshToken.startsWith("1//0mock"), true);
    console.log("  ✓ Test 1 Passed: Antigravity Manager JSON array parsing");
  }

  // Test 2: Single JSON object format
  {
    const jsonSingle = JSON.stringify({
      email: "single.user@gmail.com",
      refresh_token: "1//0single_token_1234567890abcdef"
    });
    const result = parseContent(jsonSingle);
    assert.strictEqual(result.accounts.length, 1);
    assert.strictEqual(result.accounts[0].email, "single.user@gmail.com");
    console.log("  ✓ Test 2 Passed: Single JSON object parsing");
  }

  // Test 3: Raw space-separated text format
  {
    const line = "test.user@gmail.com 1//0mock_test_token_gamma_11223344556677889900aabbccddeeff";
    const item = parseLine(line);
    assert.ok(item, "Should parse space separated line");
    assert.strictEqual(item?.email, "test.user@gmail.com");
    assert.strictEqual(item?.refreshToken.startsWith("1//0mock"), true);
    console.log("  ✓ Test 3 Passed: Space-separated 'email refresh_token' parsing");
  }

  // Test 4: Merchant pipe-delimited format with Chinese colon
  {
    const line = "seller_account@gmail.com|Password123|recovery@gmail.com|2FA_CODE|2024|US refresh_token：1//0merchant_token_sample_1234567890";
    const item = parseLine(line);
    assert.ok(item, "Should parse merchant pipe format");
    assert.strictEqual(item?.email, "seller_account@gmail.com");
    assert.strictEqual(item?.refreshToken, "1//0merchant_token_sample_1234567890");
    console.log("  ✓ Test 4 Passed: Merchant pipe format with Chinese colon parsing");
  }

  // Test 5: Merchant dash-delimited format
  {
    const line = "dash_account@gmail.com----pass----1//0dash_token_sample_1234567890";
    const item = parseLine(line);
    assert.ok(item);
    assert.strictEqual(item?.email, "dash_account@gmail.com");
    assert.strictEqual(item?.refreshToken, "1//0dash_token_sample_1234567890");
    console.log("  ✓ Test 5 Passed: Dash-separated format parsing");
  }

  // Test 6: Multi-line bulk input with mixed formats and empty lines
  {
    const bulk = `
# Comment line to ignore
user1@gmail.com 1//0token_one_1234567890

user2@gmail.com|pass|2FA refresh_token: "1//0token_two_1234567890"
{"email": "user3@gmail.com", "refreshToken": "1//0token_three_1234567890"}
invalid line without token
`;
    const result = parseContent(bulk);
    assert.strictEqual(result.accounts.length, 3, "Should parse exactly 3 valid accounts");
    assert.strictEqual(result.invalidLines.length, 1, "Should record 1 invalid line");
    console.log("  ✓ Test 6 Passed: Multi-line bulk parsing with mixed formats");
  }

  // Test 7: Deduplication
  {
    const duplicates = `
dup@gmail.com 1//0first_token_11111111111111111111
dup@gmail.com 1//0second_token_22222222222222222222
`;
    const result = parseContent(duplicates);
    assert.strictEqual(result.accounts.length, 1, "Should deduplicate to 1 account");
    assert.strictEqual(result.accounts[0].refreshToken, "1//0second_token_22222222222222222222");
    console.log("  ✓ Test 7 Passed: Account email deduplication");
  }

  // Test 8: OMP Auth document generation
  {
    const accounts = [
      { email: "user@gmail.com", refreshToken: "1//0token_1234567890" }
    ];
    const doc = buildOmpAuthDoc(accounts, "aicode-consumers");
    assert.strictEqual(doc.version, 1);
    assert.strictEqual(doc.credentials.length, 1);
    assert.strictEqual(doc.credentials[0].provider, "google-antigravity");
    assert.strictEqual(doc.credentials[0].credential.type, "oauth");
    assert.strictEqual(doc.credentials[0].credential.access, "");
    assert.strictEqual(doc.credentials[0].credential.expires, 0);
    assert.strictEqual(doc.credentials[0].credential.projectId, "aicode-consumers");
    assert.strictEqual(doc.credentials[0].credential.email, "user@gmail.com");
    console.log("  ✓ Test 8 Passed: OMP auth document generation");
  }

  console.log("\n🎉 All tests passed successfully!\n");
}

runTests();
