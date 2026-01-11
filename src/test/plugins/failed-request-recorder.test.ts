// import { beforeAll, describe, expect, spyOn, test } from "bun:test";
// import { FailedRequestRecorder } from "../../plugins/application/dashboard/failed-request-recorder";
// import { Shokupan } from "../../shokupan";

// // Mock datastore methods
// // We can't easily use mock.module for ESM in Bun if we import from original file in other places?
// // Actually we can just spyOn the methods since `datastore` object is exported.
// // The plugin imports `datastore` from `../../util/datastore`.
// // Since it's a singleton object, modifying it here should affect the plugin.

// describe("FailedRequestRecorder Plugin", () => {
//     let querySpy: any;
//     let setSpy: any;

//     beforeAll(() => {
//         // We override the methods on the real datastore object
//         // Note: This assumes datastore object is mutable or keys are writable.

//         querySpy = spyOn(datastore, 'query').mockImplementation(async (q) => {
//             // Mock responses based on query content
//             if (q.includes("SELECT count")) {
//                 return [[{ count: 1 }]]; // return 1 count by default
//             }
//             return [[]];
//         });

//         setSpy = spyOn(datastore, 'set').mockImplementation(async (recordId, value) => {
//             // RecordId toString gives us \"table:id\" format or might be complex object
//             // For failed_requests, the ID might be a composite object, just return success
//             return {} as any;
//         });

//         // Mock ready property? usage in tests only.
//     });

//     test("Records failed requests", async () => {
//         const app = new Shokupan();
//         app.use(FailedRequestRecorder());

//         app.get("/fail", () => {
//             throw new Error("Test Failure");
//         });

//         try {
//             await app.fetch(new Request("http://localhost/fail"));
//         } catch (e) { }

//         // Allow async bg task
//         await new Promise(r => setTimeout(r, 50));

//         expect(setSpy).toHaveBeenCalled();
//         const callArgs = setSpy.mock.calls[0];
//         // callArgs[0] is RecordId, callArgs[1] is the data
//         const recordId = callArgs[0];
//         expect(recordId.toString()).toContain('failed_requests');
//         const data = callArgs[1];
//         expect(data.path).toBe("/fail");
//         expect(data.error).toBe("Test Failure");
//     });

//     test("Enforces Max Capacity", async () => {
//         const max = 5;
//         const app = new Shokupan();
//         app.use(FailedRequestRecorder({ maxCapacity: max }));

//         // Mock returning count > max
//         querySpy.mockImplementation(async (q: string) => {
//             if (q.includes("SELECT count")) {
//                 return [[{ count: 10 }]];
//             }
//             return [[]];
//         });

//         app.get("/fail", () => { throw new Error("Fail"); });
//         try { await app.fetch(new Request("http://localhost/fail")); } catch (e) { }
//         await new Promise(r => setTimeout(r, 50));

//         // Should call DELETE ... ORDER BY timestamp
//         // Check calls to querySpy
//         const deleteCalls = querySpy.mock.calls.filter((c: any[]) => c[0].includes("DELETE") && c[0].includes("ORDER BY"));
//         expect(deleteCalls.length).toBeGreaterThan(0);
//         expect(deleteCalls[0][0]).toContain("LIMIT 5"); // 10 - 5 = 5
//     });

//     test("Enforces TTL", async () => {
//         const ttl = 1000;
//         const app = new Shokupan();
//         app.use(FailedRequestRecorder({ ttl }));

//         app.get("/fail", () => { throw new Error("Fail"); });
//         try { await app.fetch(new Request("http://localhost/fail")); } catch (e) { }
//         await new Promise(r => setTimeout(r, 50));

//         // Should call DELETE ... WHERE timestamp < ...
//         const deleteCalls = querySpy.mock.calls.filter((c: any[]) => c[0].includes("DELETE") && c[0].includes("timestamp <"));
//         expect(deleteCalls.length).toBeGreaterThan(0);
//     });
// });
