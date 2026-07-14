const MAX_HISTORY = 5;

const getEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const getSupabaseConfig = () => {
  return {
    url: getEnv("SUPABASE_URL"),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    tableName: process.env.SUPABASE_TABLE_NAME || "lotto_draws",
  };
};

const normalizeRow = (row) => ({
  main: row.main_numbers,
  bonus: row.bonus_number,
  createdAt: row.created_at || row.inserted_at || row.createdAt || Date.now(),
});

const fetchRows = async (config) => {
  const response = await fetch(
    `${config.url}/rest/v1/${config.tableName}?select=main_numbers,bonus_number,created_at&order=created_at.desc&limit=${MAX_HISTORY}`,
    {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Supabase query failed: ${response.status}`);
  }

  const rows = await response.json();
  return rows.map(normalizeRow);
};

const insertRow = async (config, entry) => {
  const response = await fetch(`${config.url}/rest/v1/${config.tableName}`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      main_numbers: entry.main,
      bonus_number: entry.bonus,
    }),
  });

  if (!response.ok) {
    throw new Error(`Supabase insert failed: ${response.status}`);
  }
};

const clearRows = async (config) => {
  const response = await fetch(`${config.url}/rest/v1/${config.tableName}?id=gte.0`, {
    method: "DELETE",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      Prefer: "return=minimal",
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase delete failed: ${response.status}`);
  }
};

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  try {
    const config = getSupabaseConfig();

    if (req.method === "GET") {
      const rows = await fetchRows(config);
      return res.status(200).json(rows);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const main = Array.isArray(body.main) ? body.main : [];
      const bonus = Number(body.bonus);

      if (main.length !== 6 || !Number.isInteger(bonus)) {
        return res.status(400).json({ error: "Invalid draw payload" });
      }

      await insertRow(config, { main, bonus });
      const rows = await fetchRows(config);
      return res.status(200).json(rows);
    }

    if (req.method === "DELETE") {
      await clearRows(config);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET,POST,DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("draws api error:", error);
    return res.status(500).json({ error: error.message || "Internal server error" });
  }
};
