const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'books.db');

// Connect to SQLite Database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Failed to connect to the database:', err.message);
  } else {
    console.log('Connected to the SQLite database: books.db');
  }
});

// Promise-based wrappers for sqlite3
const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(query, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(query, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(query, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Seed sample books
const sampleBooks = [
  { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', price: 399, pages: 180 },
  { title: 'To Kill a Mockingbird', author: 'Harper Lee', price: 450, pages: 281 },
  { title: 'Harry Potter and the Sorcerer\'s Stone', author: 'J.K. Rowling', price: 499, pages: 309 },
  { title: 'Harry Potter and the Chamber of Secrets', author: 'J.K. Rowling', price: 550, pages: 341 },
  { title: '1984', author: 'George Orwell', price: 350, pages: 328 },
  { title: 'Pride and Prejudice', author: 'Jane Austen', price: 299, pages: 279 },
  { title: 'The Catcher in the Rye', author: 'J.D. Salinger', price: 420, pages: 214 },
  { title: 'The Hobbit', author: 'J.R.R. Tolkien', price: 620, pages: 310 },
  { title: 'Atomic Habits', author: 'James Clear', price: 599, pages: 320 },
  { title: 'Deep Work', author: 'Cal Newport', price: 480, pages: 296 }
];

// Initialize database schema and idempotent seeding
const initDatabase = async () => {
  try {
    await dbRun(`
      CREATE TABLE IF NOT EXISTS book (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT NOT NULL,
        price REAL NOT NULL,
        pages INTEGER NOT NULL
      )
    `);

    const countRow = await dbGet('SELECT COUNT(*) AS count FROM book');
    if (countRow && countRow.count === 0) {
      console.log('Seeding initial 10 books...');
      for (const book of sampleBooks) {
        await dbRun(
          'INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?)',
          [book.title, book.author, book.price, book.pages]
        );
      }
      console.log('Initial books seeded successfully.');
    } else {
      console.log(`Database already initialized with ${countRow.count} books.`);
    }
  } catch (err) {
    console.error('Error during database initialization:', err.message);
  }
};

// Initialize DB immediately on load
initDatabase();

// Allowed columns for sorting
const ALLOWED_ORDER_BY_COLUMNS = ['id', 'title', 'author', 'price', 'pages'];

// Helper to validate integer ID
const isValidInteger = (val) => {
  const num = Number(val);
  return Number.isInteger(num) && num > 0 && String(num) === String(val).trim();
};

/* ========================================================
   REST API ENDPOINTS
   ======================================================== */

// Root Endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    message: 'Welcome to BDF Lab 3 Books API',
    endpoints: {
      getAllBooks: 'GET /books',
      getBookById: 'GET /books/:bookId',
      createBook: 'POST /books',
      updateBook: 'PUT /books/:bookId',
      deleteBook: 'DELETE /books/:bookId'
    }
  });
});

// A. GET /books (with search, filter, sort, and pagination)
app.get('/books', async (req, res) => {
  try {
    const {
      search_q,
      order_by = 'id',
      order = 'ASC',
      limit,
      offset,
      min_price,
      max_price
    } = req.query;

    // 1. Validate order_by
    const normalizedOrderBy = String(order_by).toLowerCase();
    if (!ALLOWED_ORDER_BY_COLUMNS.includes(normalizedOrderBy)) {
      return res.status(400).json({
        message: 'Invalid order_by column. Allowed columns: id, title, author, price, pages.'
      });
    }

    // 2. Validate order
    const normalizedOrder = String(order).toUpperCase();
    if (normalizedOrder !== 'ASC' && normalizedOrder !== 'DESC') {
      return res.status(400).json({
        message: 'Invalid order direction. Allowed values: ASC, DESC.'
      });
    }

    // 3. Validate min_price
    if (min_price !== undefined) {
      if (isNaN(Number(min_price)) || Number(min_price) < 0 || String(min_price).trim() === '') {
        return res.status(400).json({
          message: 'min_price must be a valid non-negative number.'
        });
      }
    }

    // 4. Validate max_price
    if (max_price !== undefined) {
      if (isNaN(Number(max_price)) || Number(max_price) < 0 || String(max_price).trim() === '') {
        return res.status(400).json({
          message: 'max_price must be a valid non-negative number.'
        });
      }
    }

    // 5. Validate min_price <= max_price
    if (min_price !== undefined && max_price !== undefined) {
      if (Number(min_price) > Number(max_price)) {
        return res.status(400).json({
          message: 'min_price cannot exceed max_price.'
        });
      }
    }

    // 6. Validate limit
    if (limit !== undefined) {
      const limitNum = Number(limit);
      if (!Number.isInteger(limitNum) || limitNum <= 0) {
        return res.status(400).json({
          message: 'Limit must be a positive integer.'
        });
      }
    }

    // 7. Validate offset
    if (offset !== undefined) {
      const offsetNum = Number(offset);
      if (!Number.isInteger(offsetNum) || offsetNum < 0) {
        return res.status(400).json({
          message: 'Offset must be a non-negative integer.'
        });
      }
    }

    // Build SQL Query
    let query = 'SELECT * FROM book';
    const conditions = [];
    const params = [];

    // Search partial title
    if (search_q && search_q.trim() !== '') {
      conditions.push('title LIKE ?');
      params.push(`%${search_q.trim()}%`);
    }

    // Price filtering
    if (min_price !== undefined && max_price !== undefined) {
      conditions.push('price BETWEEN ? AND ?');
      params.push(Number(min_price), Number(max_price));
    } else if (min_price !== undefined) {
      conditions.push('price >= ?');
      params.push(Number(min_price));
    } else if (max_price !== undefined) {
      conditions.push('price <= ?');
      params.push(Number(max_price));
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    // Sorting
    query += ` ORDER BY ${normalizedOrderBy} ${normalizedOrder}`;

    // Pagination
    if (limit !== undefined) {
      query += ' LIMIT ?';
      params.push(Number(limit));

      if (offset !== undefined) {
        query += ' OFFSET ?';
        params.push(Number(offset));
      }
    } else if (offset !== undefined) {
      // In SQLite, OFFSET without LIMIT requires LIMIT -1
      query += ' LIMIT -1 OFFSET ?';
      params.push(Number(offset));
    }

    const books = await dbAll(query, params);
    return res.status(200).json(books);
  } catch (err) {
    console.error('Error in GET /books:', err.message);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
});

// B. GET /books/:bookId
app.get('/books/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!isValidInteger(bookId)) {
      return res.status(400).json({ message: 'Book ID must be a valid integer.' });
    }

    const book = await dbGet('SELECT * FROM book WHERE id = ?', [Number(bookId)]);
    if (!book) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    return res.status(200).json(book);
  } catch (err) {
    console.error('Error in GET /books/:bookId:', err.message);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
});

// C. POST /books
app.post('/books', async (req, res) => {
  try {
    const { title, author, price, pages } = req.body;

    // Validate title
    if (title === undefined || title === null || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ message: 'Title is required.' });
    }

    // Validate author
    if (author === undefined || author === null || typeof author !== 'string' || author.trim() === '') {
      return res.status(400).json({ message: 'Author is required.' });
    }

    // Validate price
    if (
      price === undefined ||
      price === null ||
      typeof price === 'boolean' ||
      isNaN(Number(price)) ||
      String(price).trim() === '' ||
      Number(price) < 0
    ) {
      return res.status(400).json({ message: 'Price must be a valid number.' });
    }

    // Validate pages
    if (
      pages === undefined ||
      pages === null ||
      typeof pages === 'boolean' ||
      !Number.isInteger(Number(pages)) ||
      Number(pages) <= 0
    ) {
      return res.status(400).json({ message: 'Pages must be a valid positive integer.' });
    }

    const result = await dbRun(
      'INSERT INTO book (title, author, price, pages) VALUES (?, ?, ?, ?)',
      [title.trim(), author.trim(), Number(price), Number(pages)]
    );

    const createdBook = await dbGet('SELECT * FROM book WHERE id = ?', [result.lastID]);

    return res.status(201).json({
      message: 'Book created successfully.',
      bookId: result.lastID,
      book: createdBook
    });
  } catch (err) {
    console.error('Error in POST /books:', err.message);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
});

// D. PUT /books/:bookId
app.put('/books/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!isValidInteger(bookId)) {
      return res.status(400).json({ message: 'Book ID must be a valid integer.' });
    }

    // Check if book exists
    const existingBook = await dbGet('SELECT * FROM book WHERE id = ?', [Number(bookId)]);
    if (!existingBook) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const { title, author, price, pages } = req.body;

    // Validate title
    if (title === undefined || title === null || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ message: 'Title is required.' });
    }

    // Validate author
    if (author === undefined || author === null || typeof author !== 'string' || author.trim() === '') {
      return res.status(400).json({ message: 'Author is required.' });
    }

    // Validate price
    if (
      price === undefined ||
      price === null ||
      typeof price === 'boolean' ||
      isNaN(Number(price)) ||
      String(price).trim() === '' ||
      Number(price) < 0
    ) {
      return res.status(400).json({ message: 'Price must be a valid number.' });
    }

    // Validate pages
    if (
      pages === undefined ||
      pages === null ||
      typeof pages === 'boolean' ||
      !Number.isInteger(Number(pages)) ||
      Number(pages) <= 0
    ) {
      return res.status(400).json({ message: 'Pages must be a valid positive integer.' });
    }

    await dbRun(
      'UPDATE book SET title = ?, author = ?, price = ?, pages = ? WHERE id = ?',
      [title.trim(), author.trim(), Number(price), Number(pages), Number(bookId)]
    );

    const updatedBook = await dbGet('SELECT * FROM book WHERE id = ?', [Number(bookId)]);

    return res.status(200).json({
      message: 'Book updated successfully.',
      book: updatedBook
    });
  } catch (err) {
    console.error('Error in PUT /books/:bookId:', err.message);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
});

// E. DELETE /books/:bookId
app.delete('/books/:bookId', async (req, res) => {
  try {
    const { bookId } = req.params;

    if (!isValidInteger(bookId)) {
      return res.status(400).json({ message: 'Book ID must be a valid integer.' });
    }

    // Check if book exists
    const existingBook = await dbGet('SELECT * FROM book WHERE id = ?', [Number(bookId)]);
    if (!existingBook) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    await dbRun('DELETE FROM book WHERE id = ?', [Number(bookId)]);

    return res.status(200).json({
      message: 'Book deleted successfully.'
    });
  } catch (err) {
    console.error('Error in DELETE /books/:bookId:', err.message);
    return res.status(500).json({ message: 'Internal Server Error.' });
  }
});

// Handle unmatched routes
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

// Start Express server only when executed directly
let server = null;
if (require.main === module) {
  server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
}

module.exports = { app, server, db, initDatabase, PORT };

