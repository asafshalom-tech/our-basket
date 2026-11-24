# הסל שלנו – גרסת GitHub Pages + Supabase

**סטטוס:** פרויקט Our-Basket החדש הוקם בענן באזור פרנקפורט. שתי המיגרציות הותקנו ושבע הטבלאות ריקות. מפתח ציבורי בלבד הוגדר בקוד. נותר ליצור שני משתמשים, להעניק הרשאת משפחה, לבצע בדיקות PostgreSQL דו-משתמשיות ולפרסם. אין להשתמש בנתונים אמיתיים לפני סיום הבדיקות.

## סדר הקמה
1. בוצע: נוצר פרויקט Supabase חדש ונפרד (Our-Basket), במסלול Free ובאזור אירופה. אין להוסיף פרויקט בתשלום ללא אישור.
2. בוצע בפרויקט החדש: `supabase/schema.sql` ולאחריו `supabase/harden-rpc.sql`. אין להריץ אותם שוב בפרויקט הקיים. בהקמה עתידית במסד ריק יש להריץ כל אחד פעם אחת לפי הסדר. הטבלאות נוצרות בסכמה פרטית. פונקציות RPC מאומתות הן ממשק הנתונים; ההרשאה נבדקת בכל קריאה לפי `auth.uid()` מול טבלת members.
3. ב-Authentication > Providers / Sign In הגבל יצירת חשבונות (בטל Allow new users to sign up). ב-Authentication > Users צור ידנית שני משתמשים עם אימייל וסיסמאות שונות וחזקות, באמצעות Add user. אמת שהאימיילים נכונים. אין להוסיף משתמשים כמנהלי ארגון או לתת להם גישה לקוד. אין להכניס סיסמאות לקוד, לצ'אט או ל-GitHub.
4. דרך SQL Editor בלבד, לאחר החלפת שתי כתובות הדוגמה בכתובות האמיתיות, בצע:
   ```sql
   INSERT INTO basket_private.members(id,email)
   SELECT id,lower(email) FROM auth.users
   WHERE lower(email) IN ('owner@example.com','partner@example.com');
   SELECT count(*) FROM basket_private.members; -- בדיוק 2
   ```
   אין לשמור את השאילתה עם המיילים האמיתיים במאגר ציבורי. הרץ `supabase/verify.sql` (בדיקות זמניות עם rollback) ובדוק גם קריאות REST אמיתיות משתי זהויות ומזהות לא מורשית. אין לפרסם לפני שהן עוברות.
5. בוצע: הוגדרו Project URL ו-Publishable key בלבד. בהקמה מחדש, קבל את Project URL ואת ה-Publishable key בלבד (sb_publishable_...). אין להשתמש ב-secret או service_role. ערוך `public/config.js` וגם `dist/config.js` כך שיכילו רק את שני הערכים האלה. אם בונים מחדש, `npm run build` מעתיק את public/config.js ל-dist ומעדכן את גרסת המטמון.
6. צור מאגר GitHub חדש בשם `our-basket`. במסלול GitHub Pages חינמי הקוד והעמוד ציבוריים; רק מסך הכניסה והמעטפת חשופים, לא הנתונים. אפשר לפרסם את **תוכן** `dist/` בשורש של מאגר פרסום או בתיקיית `docs/`, עם קובץ `.nojekyll`, דרך Settings > Pages > Deploy from a branch. את קוד המקור אפשר לשמור במאגר נפרד אם רצוי. אל תעלה קבצי סודות, נתוני ייצוא או קובץ מסד נתונים. אין לערבב עם AB-Coach.
7. לתחזוקה אוטומטית: העלה `.github/workflows/keep-alive.yml` בשורש המאגר. הגדר Settings > Secrets and variables > Actions > Variables את SUPABASE_URL ואת SUPABASE_PUBLISHABLE_KEY. הפעל ידנית דרך Actions > Database availability check > Run workflow. הקריאה בודקת פונקציה ציבורית שמחזירה רק 1 ולא קוראת נתוני משפחה. שלוש בדיקות ביום; אין ערובה למניעת השהיה. GitHub עשוי להשבית לוחות זמנים במאגר ציבורי ללא פעילות 60 יום; בדוק מדי פעם והפעל שוב במידת הצורך. אם Supabase מושהה, פתח Dashboard ולחץ Resume project.
8. אחרי פרסום: בדוק כניסה בשני דפדפנים, הוסף מוצר בכל אחד, סמן רכישה משניהם, בדוק ביטול, מצב טיסה, סנכרון חוזר וייצוא. התקן מ-Safari > שיתוף > הוסף למסך הבית וב-Chrome Android > תפריט > הוספה למסך הבית. מיקרופון ו-PWA טרם נבדקו במכשיר פיזי.

## בדיקות
- `npm run typecheck` ו־`npm run build` עברו.
- `node --test tests/*.test.mjs` עבר 13 בדיקות. 11 בדיקות הליבה המקוריות כוללות SQLite/Cloudflare (אינן בדיקות PostgreSQL); 2 בדיקות נוספות מדמות את ממשק Supabase Auth/REST. `supabase/verify.sql` טרם הורץ בענן.
- הקוד המקורי `src/worker.ts`, `migrations/`, `scripts/local.mjs` נשמר לצורך בדיקות רגרסיה מקומיות בלבד; אינו מסלול הפרסום החדש. `README.md` המקורי מתאר את מסלול Cloudflare, לא את הגרסה הזו.
- נוצר פרויקט ענן חדש, הותקנו המיגרציות, נבדקו הרשאות והיעדר נתונים. לא הוענקו עדיין הרשאות למשתמשי המשפחה, לא פורסמה כתובת ולא נעשה שימוש בפרטי AB-Coach. בדיקות ענן עם שני משתמשים אמיתיים טרם בוצעו.
