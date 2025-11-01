import { UserModel } from "../models/User";
import { pool } from "../config/database";

async function checkUser() {
  try {
    const email = "dmememrb@gmail.com";
    console.log(`\n🔍 사용자 확인: ${email}\n`);

    // 1. UserModel로 확인
    const user = await UserModel.findByEmail(email);
    if (user) {
      console.log("✅ DB에 사용자가 존재합니다:");
      console.log({
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        googleId: (user as any).googleId,
        authProvider: (user as any).authProvider,
        createdAt: user.createdAt,
      });
    } else {
      console.log("❌ DB에 사용자가 없습니다.");
      console.log("\n💡 구글 로그인을 다시 시도하면 사용자가 생성됩니다.");
    }

    // 2. 직접 SQL로 확인
    const client = await pool.connect();
    const result = await client.query(
      "SELECT id, email, username, nickname, google_id, auth_provider, created_at FROM users WHERE email = $1",
      [email]
    );
    client.release();

    console.log("\n📊 SQL 직접 조회 결과:");
    console.log("행 개수:", result.rowCount);
    if (result.rows.length > 0) {
      console.log(result.rows[0]);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ 오류 발생:", error);
    process.exit(1);
  }
}

checkUser();





