const { app, initDatabase } = require('./index.js');

const TEST_PORT = process.env.TEST_PORT || 3001;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// Colors for terminal output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let passedCount = 0;
let failedCount = 0;
const results = [];

const recordResult = (testName, passed, details = '') => {
  if (passed) {
    passedCount++;
    console.log(`  ${GREEN}✔ PASS${RESET} - ${testName}`);
    results.push({ testName, status: 'PASS', details });
  } else {
    failedCount++;
    console.log(`  ${RED}✖ FAIL${RESET} - ${testName} (${details})`);
    results.push({ testName, status: 'FAIL', details });
  }
};

const runTests = async () => {
  console.log(`\n${BOLD}${CYAN}======================================================${RESET}`);
  console.log(`${BOLD}${CYAN}      BDF LAB 3 — AUTOMATED API TEST SUITE            ${RESET}`);
  console.log(`${BOLD}${CYAN}======================================================${RESET}\n`);

  // Start dedicated test server
  const server = app.listen(TEST_PORT, '127.0.0.1');

  try {
    // Wait for DB initialization to settle
    await initDatabase();
    await new Promise((resolve) => setTimeout(resolve, 300));

    let createdBookId = null;

    // Test 1: GET all books
    try {
      const res = await fetch(`${BASE_URL}/books`);
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data) && data.length >= 10;
      recordResult('1. GET /books (Retrieve all books)', pass, `Status: ${res.status}, Count: ${data.length}`);
    } catch (e) {
      recordResult('1. GET /books (Retrieve all books)', false, e.message);
    }

    // Test 2: GET book by ID
    try {
      const res = await fetch(`${BASE_URL}/books/1`);
      const data = await res.json();
      const pass = res.status === 200 && data.id === 1 && Boolean(data.title);
      recordResult('2. GET /books/1 (Retrieve book by valid ID)', pass, `Status: ${res.status}, Title: "${data.title}"`);
    } catch (e) {
      recordResult('2. GET /books/1 (Retrieve book by valid ID)', false, e.message);
    }

    // Test 3: Search books by partial title
    try {
      const res = await fetch(`${BASE_URL}/books?search_q=Harry`);
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data) && data.length === 2 &&
        data.every(b => b.title.toLowerCase().includes('harry'));
      recordResult('3. GET /books?search_q=Harry (Partial title search)', pass, `Status: ${res.status}, Matches: ${data.length}`);
    } catch (e) {
      recordResult('3. GET /books?search_q=Harry (Partial title search)', false, e.message);
    }

    // Test 4: Sorting by price ASC
    try {
      const res = await fetch(`${BASE_URL}/books?order_by=price&order=ASC`);
      const data = await res.json();
      let isSorted = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i].price < data[i - 1].price) {
          isSorted = false;
          break;
        }
      }
      const pass = res.status === 200 && isSorted && data.length >= 10;
      recordResult('4. GET /books?order_by=price&order=ASC (Sort ascending)', pass, `Status: ${res.status}, Min: ${data[0]?.price}, Max: ${data[data.length - 1]?.price}`);
    } catch (e) {
      recordResult('4. GET /books?order_by=price&order=ASC (Sort ascending)', false, e.message);
    }

    // Test 5: Sorting by price DESC
    try {
      const res = await fetch(`${BASE_URL}/books?order_by=price&order=DESC`);
      const data = await res.json();
      let isSorted = true;
      for (let i = 1; i < data.length; i++) {
        if (data[i].price > data[i - 1].price) {
          isSorted = false;
          break;
        }
      }
      const pass = res.status === 200 && isSorted && data.length >= 10;
      recordResult('5. GET /books?order_by=price&order=DESC (Sort descending)', pass, `Status: ${res.status}, Max: ${data[0]?.price}, Min: ${data[data.length - 1]?.price}`);
    } catch (e) {
      recordResult('5. GET /books?order_by=price&order=DESC (Sort descending)', false, e.message);
    }

    // Test 6: Pagination (limit=5&offset=5)
    try {
      const res = await fetch(`${BASE_URL}/books?limit=5&offset=5`);
      const data = await res.json();
      const pass = res.status === 200 && Array.isArray(data) && data.length === 5;
      recordResult('6. GET /books?limit=5&offset=5 (Pagination)', pass, `Status: ${res.status}, Records returned: ${data.length}`);
    } catch (e) {
      recordResult('6. GET /books?limit=5&offset=5 (Pagination)', false, e.message);
    }

    // Test 7: Price range filter (min_price=200&max_price=400)
    try {
      const res = await fetch(`${BASE_URL}/books?min_price=200&max_price=400`);
      const data = await res.json();
      const allInRange = data.every(b => b.price >= 200 && b.price <= 400);
      const pass = res.status === 200 && Array.isArray(data) && data.length > 0 && allInRange;
      recordResult('7. GET /books?min_price=200&max_price=400 (Price filter)', pass, `Status: ${res.status}, Found: ${data.length}`);
    } catch (e) {
      recordResult('7. GET /books?min_price=200&max_price=400 (Price filter)', false, e.message);
    }

    // Test 8: Combined query parameters
    try {
      const res = await fetch(`${BASE_URL}/books?search_q=Harry&order_by=price&order=ASC&limit=5&offset=0&min_price=300&max_price=500`);
      const data = await res.json();
      const matches = data.every(b => b.title.toLowerCase().includes('harry') && b.price >= 300 && b.price <= 500);
      const pass = res.status === 200 && Array.isArray(data) && data.length === 1 && matches;
      recordResult('8. Combined query parameters', pass, `Status: ${res.status}, Count: ${data.length}, Title: "${data[0]?.title}"`);
    } catch (e) {
      recordResult('8. Combined query parameters', false, e.message);
    }

    // Test 9: POST create valid book
    try {
      const res = await fetch(`${BASE_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Atomic Habits',
          author: 'James Clear',
          price: 599,
          pages: 320
        })
      });
      const data = await res.json();
      createdBookId = data.bookId || data.book?.id;
      const pass = res.status === 201 && createdBookId !== undefined && data.book?.title === 'Atomic Habits';
      recordResult('9. POST /books (Create valid book)', pass, `Status: ${res.status}, Created ID: ${createdBookId}`);
    } catch (e) {
      recordResult('9. POST /books (Create valid book)', false, e.message);
    }

    // Test 10: PUT update book (using createdBookId)
    try {
      const res = await fetch(`${BASE_URL}/books/${createdBookId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Atomic Habits - Updated',
          author: 'James Clear',
          price: 650,
          pages: 350
        })
      });
      const data = await res.json();
      const pass = res.status === 200 && data.book?.title === 'Atomic Habits - Updated' && data.book?.price === 650;
      recordResult('10. PUT /books/:id (Update existing book)', pass, `Status: ${res.status}, Updated Title: "${data.book?.title}"`);
    } catch (e) {
      recordResult('10. PUT /books/:id (Update existing book)', false, e.message);
    }

    // Test 11: DELETE book (using createdBookId)
    try {
      const res = await fetch(`${BASE_URL}/books/${createdBookId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      const pass = res.status === 200 && data.message === 'Book deleted successfully.';
      recordResult('11. DELETE /books/:id (Delete existing book)', pass, `Status: ${res.status}, Message: "${data.message}"`);
    } catch (e) {
      recordResult('11. DELETE /books/:id (Delete existing book)', false, e.message);
    }

    // Test 12: Missing title validation
    try {
      const res = await fetch(`${BASE_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author: 'Test Author',
          price: 250,
          pages: 100
        })
      });
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'Title is required.';
      recordResult('12. POST /books (Validation: Missing title)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('12. POST /books (Validation: Missing title)', false, e.message);
    }

    // Test 13: Missing author validation
    try {
      const res = await fetch(`${BASE_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Title',
          price: 250,
          pages: 100
        })
      });
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'Author is required.';
      recordResult('13. POST /books (Validation: Missing author)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('13. POST /books (Validation: Missing author)', false, e.message);
    }

    // Test 14: Non-numeric price validation
    try {
      const res = await fetch(`${BASE_URL}/books`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Validation Test Book',
          author: 'Test Author',
          price: 'abc',
          pages: 100
        })
      });
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'Price must be a valid number.';
      recordResult('14. POST /books (Validation: Non-numeric price)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('14. POST /books (Validation: Non-numeric price)', false, e.message);
    }

    // Test 15: Invalid book ID parameter
    try {
      const res = await fetch(`${BASE_URL}/books/not-a-number`);
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'Book ID must be a valid integer.';
      recordResult('15. GET /books/:id (Validation: Invalid ID format)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('15. GET /books/:id (Validation: Invalid ID format)', false, e.message);
    }

    // Test 16: Book not found (404)
    try {
      const res = await fetch(`${BASE_URL}/books/999`);
      const data = await res.json();
      const pass = res.status === 404 && data.message === 'Book not found.';
      recordResult('16. GET /books/999 (404 Not Found handling)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('16. GET /books/999 (404 Not Found handling)', false, e.message);
    }

    // Test 17: Invalid order_by query parameter
    try {
      const res = await fetch(`${BASE_URL}/books?order_by=invalid`);
      const data = await res.json();
      const pass = res.status === 400 && data.message.includes('Invalid order_by column');
      recordResult('17. GET /books?order_by=invalid (Validation: Disallowed sort column)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('17. GET /books?order_by=invalid (Validation: Disallowed sort column)', false, e.message);
    }

    // Test 18: Invalid order direction query parameter
    try {
      const res = await fetch(`${BASE_URL}/books?order=SIDEWAYS`);
      const data = await res.json();
      const pass = res.status === 400 && data.message.includes('Invalid order direction');
      recordResult('18. GET /books?order=SIDEWAYS (Validation: Invalid order direction)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('18. GET /books?order=SIDEWAYS (Validation: Invalid order direction)', false, e.message);
    }

    // Test 19: Invalid limit and offset parameters
    try {
      const res = await fetch(`${BASE_URL}/books?limit=-5`);
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'Limit must be a positive integer.';
      recordResult('19. GET /books?limit=-5 (Validation: Non-positive limit)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('19. GET /books?limit=-5 (Validation: Non-positive limit)', false, e.message);
    }

    // Test 20: Invalid price range (min_price > max_price)
    try {
      const res = await fetch(`${BASE_URL}/books?min_price=600&max_price=200`);
      const data = await res.json();
      const pass = res.status === 400 && data.message === 'min_price cannot exceed max_price.';
      recordResult('20. GET /books?min_price=600&max_price=200 (Validation: Inverted price range)', pass, `Status: ${res.status}, Error: "${data.message}"`);
    } catch (e) {
      recordResult('20. GET /books?min_price=600&max_price=200 (Validation: Inverted price range)', false, e.message);
    }

  } finally {
    server.close();
  }

  // Final Summary
  console.log(`\n${BOLD}======================================================${RESET}`);
  console.log(`${BOLD}                    TEST SUMMARY                      ${RESET}`);
  console.log(`${BOLD}======================================================${RESET}`);
  console.log(`  Total Tests  : ${results.length}`);
  console.log(`  ${GREEN}Passed       : ${passedCount}${RESET}`);
  console.log(`  ${failedCount > 0 ? RED : GREEN}Failed       : ${failedCount}${RESET}`);
  console.log(`${BOLD}======================================================${RESET}\n`);

  if (failedCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();

