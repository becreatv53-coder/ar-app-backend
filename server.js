const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// تفعيل CORS للسماح للفرونت إند بالاتصال
app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST', 'DELETE']
}));

app.use(express.json());

// إنشاء المجلدات إذا لم تكن موجودة
const dirs = ['uploads', 'uploads/images', 'uploads/models'];
dirs.forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// إتاحة الوصول للملفات المرفوعة بشكل عام
app.use('/uploads', express.static('uploads'));

// إعداد التخزين باستخدام Multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (file.fieldname === 'image') cb(null, 'uploads/images');
    else if (file.fieldname === 'model' || file.fieldname === 'mindFile') cb(null, 'uploads/models');
  },
  filename: function (req, file, cb) {
    if (file.fieldname === 'mindFile') {
      cb(null, 'targets.mind'); // اسم ثابت لملف السحابة
    } else {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + ext);
    }
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'image' && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else if (file.fieldname === 'model' && (file.originalname.endsWith('.glb') || file.originalname.endsWith('.mp4') || file.mimetype.startsWith('video/'))) {
      cb(null, true);
    } else if (file.fieldname === 'mindFile' && file.originalname.endsWith('.mind')) {
      cb(null, true);
    } else {
      cb(new Error('الصيغة غير مدعومة! مسموح بصور، ومجسمات GLB أو فيديوهات MP4 أو ملفات .mind'), false);
    }
  }
});

// قراءة البيانات المحفوظة
const dataFile = path.join(__dirname, 'data.json');
let targets = [];
if (fs.existsSync(dataFile)) {
  try {
    targets = JSON.parse(fs.readFileSync(dataFile));
  } catch (e) {
    targets = [];
  }
}

const saveData = (data) => {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
};

// ---------------- مسارات الـ API ----------------

// 1. جلب كل الأهداف
app.get('/api/targets', (req, res) => {
  res.json(targets);
});

// 2. رفع صورة وهدف جديد (مجسم أو فيديو)
app.post('/api/targets', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'model', maxCount: 1 }]), (req, res) => {
  try {
    const { name } = req.body;
    const imageFile = req.files['image'][0];
    const modelFile = req.files['model'][0];

    // تحديد نوع الهدف (فيديو أو مجسم 3D)
    const mediaType = (modelFile.originalname.endsWith('.mp4') || modelFile.mimetype.startsWith('video/')) ? 'video' : '3d';

    const newTarget = {
      id: Date.now().toString(),
      name: name,
      imageUrl: `/uploads/images/${imageFile.filename}`,
      modelUrl: `/uploads/models/${modelFile.filename}`,
      mediaType: mediaType, // حفظ النوع لمعرفة كيفية عرضه في الموبايل
      index: targets.length
    };

    targets.push(newTarget);
    saveData(targets);

    res.json({ success: true, target: newTarget });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. رفع ملف السحابة المدمج (targets.mind)
app.post('/api/compile', upload.single('mindFile'), (req, res) => {
  try {
    res.json({ success: true, message: 'تم تحديث السحابة بنجاح!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. حذف هدف
app.delete('/api/targets/:id', (req, res) => {
  const id = req.params.id;
  const targetIndex = targets.findIndex(t => t.id === id);
  
  if (targetIndex > -1) {
    const target = targets[targetIndex];
    
    // محاولة حذف الملفات من السيرفر
    try {
      if (fs.existsSync(path.join(__dirname, target.imageUrl))) {
        fs.unlinkSync(path.join(__dirname, target.imageUrl));
      }
      if (fs.existsSync(path.join(__dirname, target.modelUrl))) {
        fs.unlinkSync(path.join(__dirname, target.modelUrl));
      }
    } catch (e) {
      console.error("لم يتم حذف الملفات فعلياً:", e);
    }

    targets.splice(targetIndex, 1);
    
    // إعادة ترتيب الـ Index ليتوافق مع ملف الـ Mind الجديد الذي سيتكون
    targets.forEach((t, i) => {
      t.index = i;
    });

    saveData(targets);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'لم يتم العثور على المجسم' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
