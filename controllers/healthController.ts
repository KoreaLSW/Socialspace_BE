import { Request, Response } from "express";
import { pool } from "../config/database";

export const getHealth = async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();

    res.json({
      success: true,
      status: "healthy",
      database: "connected",
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: "unhealthy",
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};

export const testDatabase = async (req: Request, res: Response) => {
  try {
    const client = await pool.connect();

    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      ) as exists;
    `);

    const dbInfo = await client.query(`
      SELECT 
        current_database() as database_name,
        current_user as current_user,
        version() as version
    `);

    client.release();

    res.json({
      success: true,
      data: {
        database: {
          name: dbInfo.rows[0].database_name,
          user: dbInfo.rows[0].current_user,
          version: dbInfo.rows[0].version.split(" ")[0],
        },
        tables: {
          usersExists: tableCheck.rows[0].exists,
        },
      },
      message: "Database test completed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Database query failed",
      details: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};
