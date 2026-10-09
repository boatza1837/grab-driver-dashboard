# Grab Driver Dashboard

แดชบอร์ดภาษาไทยสำหรับคนขับ Grab แบบ mobile first รันด้วย Node.js 24+ และ SQLite จริง ข้อมูลหลักไม่อยู่ใน localStorage

## เปิดใช้งาน

1. ติดตั้ง Node.js 24 หรือใหม่กว่า
2. คัดลอก `.env.example` เป็น `.env` และตั้ง `SESSION_SECRET` เป็นค่าสุ่มยาวอย่างน้อย 32 ตัวอักษร
3. รัน `npm install` แล้ว `npm run seed` เพื่อสร้างข้อมูลทดลอง (ทำครั้งเดียว)
4. รัน `npm start` หรือ `npm run dev` แล้วเปิด `http://localhost:3000`
5. กด **ทดลองด้วยข้อมูลตัวอย่าง** หากยังไม่ได้ตั้งค่า Google Login

ฐานข้อมูล SQLite อยู่ที่ `database/grab.sqlite` และสร้างตารางจาก `database/001_init.sql` อัตโนมัติเมื่อเริ่มระบบ คำสั่ง `npm run build`, `npm run lint`, `npm test` ใช้ตรวจโปรเจกต์

## ตั้งค่าบริการจริง

| บริการ | ตัวแปรที่ต้องใส่ | หมายเหตุ |
|---|---|---|
| Google Login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | ลงทะเบียน redirect URI ใน Google Cloud Console; session cookie มีอายุ 22 วัน |
| จำกัดบัญชี | `GOOGLE_ALLOWED_EMAIL` | เว้นว่างได้หากต้องการให้ทุกบัญชี Google ที่ยืนยันอีเมลเข้าใช้ |
| LINE | `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | ตั้ง webhook URL เป็น `https://โดเมนของคุณ/api/integrations/line/webhook`; ใส่ LINE User ID ในหน้าตั้งค่าเพื่อจับคู่บัญชี; ข้อความ `เติมน้ำมัน 30 1200 54321` หมายถึงลิตร ราคา และเลขไมล์ |
| FlowTrack | `FLOWTRACK_BASE_URL`, `FLOWTRACK_API_KEY`, `FLOWTRACK_FUEL_PATH` | adapter คาดหวัง JSON array ของ `{id, filled_at, liters, total_baht, odometer_km, station}`; ปรับ mapping หาก API จริงต่างออกไป |
| OCR | `GOOGLE_VISION_API_KEY` | เมื่อไม่ได้ตั้งค่า ยังอัปโหลดภาพและสร้างร่างให้กรอกเองได้ |

`APP_ORIGIN` และ `GOOGLE_REDIRECT_URI` ต้องตรงกับที่เปิดใช้งานจริง ใช้ HTTPS บนเซิร์ฟเวอร์จริง และตั้ง `DEMO_MODE=false` ก่อนให้ผู้อื่นเข้าถึง ห้ามเผยแพร่ `.env`, ฐานข้อมูล หรือโฟลเดอร์ `uploads`.

## วิธีคิดตัวเลข

- เงินรับสุทธิจากเที่ยว = ค่าโดยสาร + ทิป − ค่าธรรมเนียมแพลตฟอร์ม
- กำไรเที่ยวโดยประมาณ = เงินรับสุทธิ − ค่าทางด่วน − (กม. รวม × ต้นทุนน้ำมันต่อกม.)
- กำไรเงินสดในช่วงเวลา = เงินรับสุทธิ − ค่าน้ำมันที่บันทึก − ค่าใช้จ่ายอื่นที่บันทึก จึงอาจต่างจากกำไรเที่ยวโดยประมาณ
- กม./ลิตร = ระยะเลขไมล์ระหว่างการเติมน้ำมันสองครั้งล่าสุด ÷ ลิตรที่เติมครั้งล่าสุด
- ช่วงขับข้ามเที่ยงคืนแบ่งตามขอบวันเวลา `Asia/Bangkok`; บันทึกย้อนหลังและหลายช่วงต่อวันได้
- SQLite `NUMERIC` เก็บค่าจำนวนเต็มหน่วยสตางค์สำหรับเงินทุกช่อง เพื่อหลีกเลี่ยงความคลาดเคลื่อนของ floating point; API รับ/ส่งหน่วยบาทสองตำแหน่ง
- wallet ledger แยกเครดิต Grab กับเงินสด งานวิ่งสร้างรายการรับเงินและค่าธรรมเนียมให้อัตโนมัติ และเพิ่มรายการปรับยอดเองได้

## โครงสร้าง

- `frontend/` หน้าจอภาษาไทยแบบ responsive
- `backend/` HTTP API, Google OAuth, LINE webhook, FlowTrack adapter, OCR draft, analytics
- `database/` migration SQLite
- `scripts/` build และข้อมูลทดลอง
- `tests/` การคำนวณและโครงสร้างฐานข้อมูล

ข้อมูล OCR เป็นร่างจนกดตรวจและบันทึก ภาพอยู่ใน `uploads/` ในเครื่องนี้ การเชื่อมต่อภายนอกต้องใช้ credentials ของคุณจึงจะทดสอบแบบ end-to-end ได้
