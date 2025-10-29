/**
 * server.js
 *
 * Original file preserved with minimal, targeted changes:
 * - Replace local disk multer storage with multer-gridfs-storage (GridFS) to store files permanently in MongoDB Atlas.
 * - Keep original Material/Question/Update fields (fileName, originalFileName, filePath, fileSize, fileType)
 *   for frontend compatibility. For GridFS stored files we set:
 *     - fileName => GridFS filename
 *     - originalFileName => original uploaded name
 *     - filePath => null (kept but not used for GridFS)
 *     - fileId => ObjectId of GridFS file (new field, optional)
 * - View & Download endpoints stream from GridFS when fileId exists; fall back to filesystem only if an actual valid filePath exists.
 *
 * Notes:
 * 1. Install dependencies before running:
 *    npm install multer-gridfs-storage gridfs-stream --legacy-peer-deps
 *
 * 2. This keeps all routes and behavior same as your original app; only upload/storage logic changed.
 */

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { GridFsStorage } = require('multer-gridfs-storage');
const { ObjectId } = require('mongodb');

const app = express();

// -------------------------
// MongoDB Connection
// -------------------------
const mongoURI = '';

mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

const conn = mongoose.connection;
let gfsBucket = null;

conn.once('open', () => {
    console.log('✅ MongoDB connected successfully');
    // Initialize GridFS Bucket named 'uploads'
    gfsBucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
    console.log('✅ GridFS bucket initialized (uploads)');
});

mongoose.connection.on('error', (err) => {
    console.log('❌ MongoDB connection error:', err);
});

// -------------------------
// Middleware & Static
// -------------------------
app.use(express.json());
app.use(express.static('frontend'));

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// -------------------------
// Local uploads directory (kept for backward compatibility only)
// -------------------------
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// -------------------------
// Multer-GridFS Storage Setup
// -------------------------
// We use multer-gridfs-storage so uploaded files go to GridFS in Atlas.
const storage = new GridFsStorage({
    url: mongoURI,
    options: { useUnifiedTopology: true },
    file: (req, file) => {
        const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
        return {
            filename,
            bucketName: 'uploads',
            metadata: {
                originalname: file.originalname,
                uploadedBy: req.body.createdBy || 'unknown',
                purpose: req.baseUrl || 'student_portal_upload'
            }
        };
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit (same as original)
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|jpg|jpeg|png|gif|mp4|mp3|zip|rar)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload educational content files.'));
        }
    }
});

// -------------------------
// Schemas
// -------------------------
const StudentSchema = new mongoose.Schema({
    name: String,
    userId: { type: String, unique: true },
    password: String,
    phone: String,
    year: String,
    department: String,
    createdAt: { type: Date, default: Date.now }
});

const FacultySchema = new mongoose.Schema({
    name: String,
    userId: { type: String, unique: true },
    password: String,
    department: String,
    phone: String,
    createdAt: { type: Date, default: Date.now }
});

const AdminSchema = new mongoose.Schema({
    name: String,
    userId: { type: String, unique: true },
    password: String,
    role: String,
    phone: String,
    createdAt: { type: Date, default: Date.now }
});

// NOTE: keep original fields for compatibility. Add fileId for GridFS reference.
const MaterialSchema = new mongoose.Schema({
    title: String,
    description: String,
    year: String,
    department: String,
    fileName: String,          // GridFS filename or legacy local filename
    originalFileName: String,  // original filename
    filePath: String,          // path on disk (legacy; will be null for GridFS)
    fileSize: Number,
    fileType: String,
    fileId: { type: mongoose.Schema.Types.ObjectId, required: false }, // GridFS file id
    createdBy: String,
    createdAt: { type: Date, default: Date.now }
});

const AttendanceSchema = new mongoose.Schema({
    studentId: String,
    studentName: String,
    status: String,
    date: Date,
    period: String,
    subject: String,
    markedBy: String,
    year: String,
    department: String
});

// -------------------------
// Models
// -------------------------
const Student = mongoose.model('Student', StudentSchema);
const Faculty = mongoose.model('Faculty', FacultySchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Material = mongoose.model('Material', MaterialSchema);
const Question = mongoose.model('Question', MaterialSchema);
const Update = mongoose.model('Update', MaterialSchema);
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// -------------------------
// Health check endpoint
// -------------------------
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    res.json({
        status: 'Server running',
        database: dbStatus,
        port: 3000,
        timestamp: new Date().toISOString()
    });
});

// -------------------------
// Authentication Routes
// (unchanged logic)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { userId, password, userType, year, department } = req.body;
        let user = null;

        if (userType === 'student') {
            let query = { userId };
            if (year) query.year = year;
            if (department) query.department = department;
            user = await Student.findOne(query);
        } else if (userType === 'faculty') {
            user = await Faculty.findOne({ userId });
        } else if (userType === 'admin') {
            user = await Admin.findOne({ userId });
        }

        if (user && user.password === password) {
            res.json({ success: true, user: { ...user.toObject(), type: userType } });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Student / Faculty / Admin CRUD (unchanged)
// -------------------------
app.post('/api/students', async (req, res) => {
    try {
        const student = new Student(req.body);
        await student.save();
        res.json({ success: true, data: student });
    } catch (error) {
        if (error.code === 11000) {
            res.json({ success: false, message: 'Student ID already exists' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/api/students', async (req, res) => {
    try {
        const { year, department } = req.query;
        let query = {};
        if (year) query.year = year;
        if (department) query.department = department;

        const students = await Student.find(query);
        res.json({ success: true, data: students });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/students/bulk', async (req, res) => {
    try {
        const { students } = req.body;
        const results = [];
        const duplicates = [];
        let addedCount = 0;

        for (const studentData of students) {
            try {
                const student = new Student(studentData);
                await student.save();
                results.push(student);
                addedCount++;
            } catch (error) {
                if (error.code === 11000) {
                    duplicates.push(studentData.userId);
                }
            }
        }

        res.json({ success: true, addedCount, duplicates, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/students/delete', async (req, res) => {
    try {
        const { year, department } = req.query;

        if (!year || !department) {
            return res.status(400).json({ success: false, message: 'Year and department are required' });
        }

        const result = await Student.deleteMany({ year, department });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/students/delete/individual', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const result = await Student.deleteOne({ userId });

        if (result.deletedCount > 0) {
            res.json({ success: true, deletedCount: result.deletedCount });
        } else {
            res.json({ success: false, message: 'Student not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Faculty
app.post('/api/faculty', async (req, res) => {
    try {
        const faculty = new Faculty(req.body);
        await faculty.save();
        res.json({ success: true, data: faculty });
    } catch (error) {
        if (error.code === 11000) {
            res.json({ success: false, message: 'Faculty ID already exists' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/api/faculty', async (req, res) => {
    try {
        const faculty = await Faculty.find();
        res.json({ success: true, data: faculty });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/faculty/bulk', async (req, res) => {
    try {
        const { faculty } = req.body;
        const results = [];
        const duplicates = [];
        let addedCount = 0;

        for (const facultyData of faculty) {
            try {
                const facultyMember = new Faculty(facultyData);
                await facultyMember.save();
                results.push(facultyMember);
                addedCount++;
            } catch (error) {
                if (error.code === 11000) {
                    duplicates.push(facultyData.userId);
                }
            }
        }

        res.json({ success: true, addedCount, duplicates, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/faculty/departments', async (req, res) => {
    try {
        const faculty = await Faculty.find().distinct('department');
        res.json({ success: true, data: faculty.filter(Boolean).sort() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/departments', async (req, res) => {
    try {
        const admins = await Admin.find();
        const roles = [...new Set(admins.map(a => a.role).filter(Boolean))].sort();
        const departments = [...new Set(admins.map(a => a.department).filter(Boolean))].sort();
        const allDepartments = [...new Set([...roles, ...departments])].sort();
        res.json({ success: true, data: allDepartments });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/faculty/delete', async (req, res) => {
    try {
        const { department } = req.query;

        if (!department) {
            return res.status(400).json({ success: false, message: 'Department is required' });
        }

        const result = await Faculty.deleteMany({ department });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/faculty/delete/individual', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const result = await Faculty.deleteOne({ userId });

        if (result.deletedCount > 0) {
            res.json({ success: true, deletedCount: result.deletedCount });
        } else {
            res.json({ success: false, message: 'Faculty not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin
app.post('/api/admin', async (req, res) => {
    try {
        const admin = new Admin(req.body);
        await admin.save();
        res.json({ success: true, data: admin });
    } catch (error) {
        if (error.code === 11000) {
            res.json({ success: false, message: 'Admin ID already exists' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

app.get('/api/admin', async (req, res) => {
    try {
        const admins = await Admin.find();
        res.json({ success: true, data: admins });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/bulk', async (req, res) => {
    try {
        const { admins } = req.body;
        const results = [];
        const duplicates = [];
        let addedCount = 0;

        for (const adminData of admins) {
            try {
                const admin = new Admin(adminData);
                await admin.save();
                results.push(admin);
                addedCount++;
            } catch (error) {
                if (error.code === 11000) {
                    duplicates.push(adminData.userId);
                }
            }
        }

        res.json({ success: true, addedCount, duplicates, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/delete', async (req, res) => {
    try {
        const { role } = req.query;

        if (!role) {
            return res.status(400).json({ success: false, message: 'Role is required' });
        }

        const result = await Admin.deleteMany({ role });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/delete/individual', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }

        const result = await Admin.deleteOne({ userId });

        if (result.deletedCount > 0) {
            res.json({ success: true, deletedCount: result.deletedCount });
        } else {
            res.json({ success: false, message: 'Admin not found' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Material Routes (uploads now use GridFS)
// -------------------------
app.post('/api/materials/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // multer-gridfs-storage provides file info in req.file
        // file id property may be stored in req.file.id or req.file._id depending on version
        const gridFileId = req.file.id || req.file._id || (req.file.fileId ? req.file.fileId : null);
        const gridFilename = req.file.filename;
        const originalFileName = (req.file.metadata && req.file.metadata.originalname) || req.file.originalname || req.file.originalName || req.file.filename;
        const fileType = req.file.contentType || req.file.mimetype || 'application/octet-stream';
        const fileSize = req.file.size || 0;

        const material = new Material({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: gridFilename,
            originalFileName,
            filePath: null,   // no local path for GridFS
            fileSize,
            fileType,
            fileId: gridFileId
        });

        await material.save();
        res.json({ success: true, message: 'Material uploaded successfully', data: material });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// keep POST /api/materials unchanged
app.post('/api/materials', async (req, res) => {
    try {
        const material = new Material(req.body);
        await material.save();
        res.json({ success: true, data: material });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/materials/year/:year', async (req, res) => {
    try {
        const { department } = req.query;
        let query = { year: req.params.year };
        if (department) query.department = department;

        const materials = await Material.find(query);
        res.json({ success: true, data: materials });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/materials', async (req, res) => {
    try {
        const materials = await Material.find();
        res.json({ success: true, data: materials });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// File download endpoint
// Streams from GridFS when fileId exists, otherwise falls back to local file only if filePath points to a real file
// -------------------------
app.get('/api/files/download/:id', async (req, res) => {
    try {
        let content = null;

        content = await Material.findById(req.params.id);
        if (!content) content = await Question.findById(req.params.id);
        if (!content) content = await Update.findById(req.params.id);

        if (!content) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        // If stored in GridFS
        if (content.fileId) {
            if (!gfsBucket) {
                return res.status(500).json({ success: false, message: 'GridFS bucket not initialized' });
            }

            const fileObjectId = typeof content.fileId === 'string' ? new ObjectId(content.fileId) : content.fileId;

            res.setHeader('Content-Type', content.fileType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${content.originalFileName || content.fileName || 'file'}"`);

            const downloadStream = gfsBucket.openDownloadStream(fileObjectId);
            downloadStream.on('error', (err) => {
                console.error('GridFS download error:', err);
                return res.status(404).json({ success: false, message: 'File not found on server' });
            });
            downloadStream.pipe(res);
            return;
        }

        // Fallback to local filesystem only if a valid filePath exists and is a file
        if (content.filePath && typeof content.filePath === 'string' && fs.existsSync(content.filePath)) {
            const stats = fs.statSync(content.filePath);
            if (stats.isFile()) {
                return res.download(content.filePath, content.originalFileName || content.fileName);
            }
        }

        return res.status(404).json({ success: false, message: 'File not found on server' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// File view endpoint
// Streams inline from GridFS when fileId exists; fallback similar to download
// -------------------------
app.get('/api/files/view/:id', async (req, res) => {
    try {
        let content = null;

        content = await Material.findById(req.params.id);
        if (!content) content = await Question.findById(req.params.id);
        if (!content) content = await Update.findById(req.params.id);

        if (!content) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (content.fileId) {
            if (!gfsBucket) {
                return res.status(500).json({ success: false, message: 'GridFS bucket not initialized' });
            }

            const fileObjectId = typeof content.fileId === 'string' ? new ObjectId(content.fileId) : content.fileId;

            res.setHeader('Content-Type', content.fileType || 'application/octet-stream');
            res.setHeader('Content-Disposition', `inline; filename="${content.originalFileName || content.fileName || 'file'}"`);

            const downloadStream = gfsBucket.openDownloadStream(fileObjectId);
            downloadStream.on('error', (err) => {
                console.error('GridFS view error:', err);
                return res.status(404).json({ success: false, message: 'File not found on server' });
            });
            downloadStream.pipe(res);
            return;
        }

        // fallback to local file only if actual file exists
        if (content.filePath && typeof content.filePath === 'string' && fs.existsSync(content.filePath)) {
            const stats = fs.statSync(content.filePath);
            if (stats.isFile()) {
                res.setHeader('Content-Type', content.fileType || 'application/octet-stream');
                res.setHeader('Content-Disposition', `inline; filename="${content.originalFileName || content.fileName}"`);
                const fileStream = fs.createReadStream(content.filePath);
                fileStream.pipe(res);
                return;
            }
        }

        return res.status(404).json({ success: false, message: 'File not found on server' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Question Routes (GridFS)
// -------------------------
app.post('/api/questions/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const gridFileId = req.file.id || req.file._id || (req.file.fileId ? req.file.fileId : null);
        const gridFilename = req.file.filename;
        const originalFileName = (req.file.metadata && req.file.metadata.originalname) || req.file.originalname || gridFilename;
        const fileType = req.file.contentType || req.file.mimetype || 'application/octet-stream';
        const fileSize = req.file.size || 0;

        const question = new Question({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: gridFilename,
            originalFileName,
            filePath: null,
            fileSize,
            fileType,
            fileId: gridFileId
        });

        await question.save();
        res.json({ success: true, message: 'Question bank uploaded successfully', data: question });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/questions', async (req, res) => {
    try {
        const question = new Question(req.body);
        await question.save();
        res.json({ success: true, data: question });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/questions/year/:year', async (req, res) => {
    try {
        const { department } = req.query;
        let query = { year: req.params.year };
        if (department) query.department = department;

        const questions = await Question.find(query);
        res.json({ success: true, data: questions });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Update upload endpoint (GridFS)
// -------------------------
app.post('/api/updates/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const gridFileId = req.file.id || req.file._id || (req.file.fileId ? req.file.fileId : null);
        const gridFilename = req.file.filename;
        const originalFileName = (req.file.metadata && req.file.metadata.originalname) || req.file.originalname || gridFilename;
        const fileType = req.file.contentType || req.file.mimetype || 'application/octet-stream';
        const fileSize = req.file.size || 0;

        const update = new Update({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: gridFilename,
            originalFileName,
            filePath: null,
            fileSize,
            fileType,
            fileId: gridFileId
        });

        await update.save();
        res.json({ success: true, message: 'Update uploaded successfully', data: update });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/updates', async (req, res) => {
    try {
        const update = new Update(req.body);
        await update.save();
        res.json({ success: true, data: update });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/updates/year/:year', async (req, res) => {
    try {
        const { department } = req.query;
        let query = { year: req.params.year };
        if (department) query.department = department;

        const updates = await Update.find(query);
        res.json({ success: true, data: updates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/updates', async (req, res) => {
    try {
        const updates = await Update.find();
        res.json({ success: true, data: updates });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Attendance Routes (unchanged)
// -------------------------
app.post('/api/attendance', async (req, res) => {
    try {
        const { records } = req.body;
        const results = [];

        for (const record of records) {
            const attendance = new Attendance(record);
            await attendance.save();
            results.push(attendance);
        }

        res.json({ success: true, data: results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/attendance/student/:studentId', async (req, res) => {
    try {
        const attendance = await Attendance.find({ studentId: req.params.studentId }).sort({ date: -1 });
        res.json({ success: true, data: attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/attendance/department', async (req, res) => {
    try {
        const { year, department, date, period } = req.query;
        let query = {};

        if (year) query.year = year;
        if (department) query.department = department;
        if (date) {
            const startDate = new Date(date);
            const endDate = new Date(date);
            endDate.setDate(endDate.getDate() + 1);
            query.date = { $gte: startDate, $lt: endDate };
        }
        if (period) query.period = period;

        const attendance = await Attendance.find(query).sort({ date: -1, studentName: 1 });
        res.json({ success: true, data: attendance });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// SMS Routes (unchanged)
// -------------------------
app.post('/api/sms/send', async (req, res) => {
    try {
        const { recipients, message, sentBy, type } = req.body;

        console.log('📱 SMS Send Request:', {
            recipients: recipients.length,
            sentBy,
            type,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'SMS logged successfully',
            count: recipients.length
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Delete content routes
// Delete GridFS file if fileId exists, otherwise delete local file if present
// -------------------------
async function deleteGridFSFileById(fileObjectId) {
    if (!fileObjectId) return;
    if (!gfsBucket) {
        console.warn('GridFS bucket not initialized; cannot delete file.');
        return;
    }
    try {
        const id = typeof fileObjectId === 'string' ? new ObjectId(fileObjectId) : fileObjectId;
        await gfsBucket.delete(id);
    } catch (err) {
        console.warn('GridFS delete warning:', err && err.message);
    }
}

app.delete('/api/materials/:id', async (req, res) => {
    try {
        const material = await Material.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, message: 'Material not found' });
        }

        if (material.fileId) {
            await deleteGridFSFileById(material.fileId);
        } else if (material.filePath && fs.existsSync(material.filePath)) {
            try { fs.unlinkSync(material.filePath); } catch(e){/* ignore */ }
        }

        await Material.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Material deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/questions/:id', async (req, res) => {
    try {
        const question = await Question.findById(req.params.id);
        if (!question) {
            return res.status(404).json({ success: false, message: 'Question not found' });
        }

        if (question.fileId) {
            await deleteGridFSFileById(question.fileId);
        } else if (question.filePath && fs.existsSync(question.filePath)) {
            try { fs.unlinkSync(question.filePath); } catch(e){/* ignore */ }
        }

        await Question.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Question deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/updates/:id', async (req, res) => {
    try {
        const update = await Update.findById(req.params.id);
        if (!update) {
            return res.status(404).json({ success: false, message: 'Update not found' });
        }

        if (update.fileId) {
            await deleteGridFSFileById(update.fileId);
        } else if (update.filePath && fs.existsSync(update.filePath)) {
            try { fs.unlinkSync(update.filePath); } catch(e){/* ignore */ }
        }

        await Update.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Update deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// -------------------------
// Start server
// -------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log('📊 MongoDB connecting to student_portal database...');
    console.log('🚀 Student Portal API Ready');
    console.log('📁 File uploads handled by GridFS (uploads bucket)');
    console.log('🔗 Health check: http://localhost:5000/api/health');
    console.log('📥 File download endpoint: /api/files/download/:id');
    console.log('👁️  File view endpoint: /api/files/view/:id');
    console.log('📤 Update upload endpoint: /api/updates/upload');
});
