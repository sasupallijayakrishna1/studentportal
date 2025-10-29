const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const app = express();

// MongoDB Connection
mongoose.connect('mongodb+srv://sasupallijayakrishna_db_user:StudentPortal@clustergist.5tnp2tf.mongodb.net/?appName=ClusterGist', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Check MongoDB connection
mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
    console.log('❌ MongoDB connection error:', err);
});

// Middleware
app.use(express.json());
app.use(express.static('frontend'));

// Serve the HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// // Middleware
// app.use(express.json());
// app.use(express.static(path.join(__dirname, 'frontend')));

// // Serve the HTML file
// app.get('/', (req, res) => {
//     res.sendFile(path.join(__dirname, 'frontend','index.html'));
// });

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads directory
app.use('/uploads', express.static(uploadsDir));

// Multer setup for handling file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadsDir);
    },
    filename: function (req, file, cb) {
        // Create unique filename
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit
    },
    fileFilter: function (req, file, cb) {
        // Allow all file types for educational content
        const allowedTypes = /\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt|jpg|jpeg|png|gif|mp4|mp3|zip|rar)$/i;
        if (allowedTypes.test(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload educational content files.'));
        }
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    res.json({ 
        status: 'Server running', 
        database: dbStatus,
        port: 3000,
        timestamp: new Date().toISOString()
    });
});

// Schemas
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

const MaterialSchema = new mongoose.Schema({
    title: String,
    description: String,
    year: String,
    department: String,
    fileName: String,
    originalFileName: String,
    filePath: String,
    fileSize: Number,
    fileType: String,
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

// Models
const Student = mongoose.model('Student', StudentSchema);
const Faculty = mongoose.model('Faculty', FacultySchema);
const Admin = mongoose.model('Admin', AdminSchema);
const Material = mongoose.model('Material', MaterialSchema);
const Question = mongoose.model('Question', MaterialSchema);
const Update = mongoose.model('Update', MaterialSchema);
const Attendance = mongoose.model('Attendance', AttendanceSchema);

// Authentication Routes
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

// Student Routes
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

// Delete students by year and department
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

// Delete individual student by ID
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

// Faculty Routes
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

// FIXED: Separate endpoints for faculty and admin departments
app.get('/api/faculty/departments', async (req, res) => {
    try {
        const faculty = await Faculty.find().distinct('department');
        res.json({ success: true, data: faculty.filter(Boolean).sort() });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// FIXED: Get existing departments/roles for admins separately
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

// Delete faculty by department
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

// Delete individual faculty by ID
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

// Admin Routes
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

// Delete admins by role
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

// Delete individual admin by ID
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

// Material Routes
app.post('/api/materials/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const material = new Material({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: req.file.filename,
            originalFileName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            fileType: req.file.mimetype
        });

        await material.save();
        res.json({ success: true, message: 'Material uploaded successfully', data: material });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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

// File download endpoint - now checks all content types
app.get('/api/files/download/:id', async (req, res) => {
    try {
        let content = null;
        
        // Try to find the file in materials, questions, or updates
        content = await Material.findById(req.params.id);
        if (!content) {
            content = await Question.findById(req.params.id);
        }
        if (!content) {
            content = await Update.findById(req.params.id);
        }
        
        if (!content) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (!content.fileName) {
            return res.status(404).json({ success: false, message: 'No file attached to this content' });
        }

        const filePath = content.filePath || path.join(uploadsDir, content.fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        res.download(filePath, content.originalFileName || content.fileName);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// File view endpoint - now checks all content types
app.get('/api/files/view/:id', async (req, res) => {
    try {
        let content = null;
        
        // Try to find the file in materials, questions, or updates
        content = await Material.findById(req.params.id);
        if (!content) {
            content = await Question.findById(req.params.id);
        }
        if (!content) {
            content = await Update.findById(req.params.id);
        }
        
        if (!content) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        if (!content.fileName) {
            return res.status(404).json({ success: false, message: 'No file attached to this content' });
        }

        const filePath = content.filePath || path.join(uploadsDir, content.fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }

        // Set appropriate content type
        res.setHeader('Content-Type', content.fileType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${content.originalFileName || content.fileName}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Question Routes
app.post('/api/questions/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const question = new Question({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: req.file.filename,
            originalFileName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            fileType: req.file.mimetype
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

// Update upload endpoint for updates with files
app.post('/api/updates/upload', upload.single('file'), async (req, res) => {
    try {
        const { title, description, year, department, createdBy } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const update = new Update({
            title,
            description,
            year,
            department,
            createdBy,
            fileName: req.file.filename,
            originalFileName: req.file.originalname,
            filePath: req.file.path,
            fileSize: req.file.size,
            fileType: req.file.mimetype
        });

        await update.save();
        res.json({ success: true, message: 'Update uploaded successfully', data: update });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update Routes
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

// Attendance Routes
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

// Get attendance by department with filters
app.get('/api/attendance/department', async (req, res) => {
    try {
        const { year, department, date, period } = req.query;
        let query = {};
        
        if (year) query.year = year;
        if (department) query.department = department;
        if (date) {
            // Create date range for the entire day
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

// SMS Routes
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

// Delete content routes
app.delete('/api/materials/:id', async (req, res) => {
    try {
        const material = await Material.findById(req.params.id);
        if (!material) {
            return res.status(404).json({ success: false, message: 'Material not found' });
        }

        // Delete file from filesystem
        if (material.filePath && fs.existsSync(material.filePath)) {
            fs.unlinkSync(material.filePath);
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

        // Delete file from filesystem
        if (question.filePath && fs.existsSync(question.filePath)) {
            fs.unlinkSync(question.filePath);
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

        // Delete file from filesystem
        if (update.filePath && fs.existsSync(update.filePath)) {
            fs.unlinkSync(update.filePath);
        }

        await Update.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Update deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log('📊 MongoDB connecting to student_portal database...');
    console.log('🚀 Student Portal API Ready');
    console.log('📁 File uploads enabled - uploads/ directory');
    console.log('🔗 Health check: http://localhost:5000/api/health');
    console.log('📥 File download endpoint: /api/files/download/:id');
    console.log('👁️  File view endpoint: /api/files/view/:id');
    console.log('📤 Update upload endpoint: /api/updates/upload');
    console.log('👤 Admin management enabled');
    console.log('📅 Enhanced attendance with date/period support');
    console.log('🔍 Department-wise student and attendance viewing enabled');
    console.log('🗑️  Delete functionality for students, faculty, and admins enabled');
    console.log('🆔 Individual delete by ID functionality added');
    console.log('🔧 FIXED: Separate faculty and admin department filters');
});
