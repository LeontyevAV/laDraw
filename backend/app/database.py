from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.models import Base

DATABASE_URL = "sqlite+aiosqlite:///./ladraw.db"

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, expire_on_commit=False)


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        result = await conn.execute(text("PRAGMA table_info(projects)"))
        cols = {row[1] for row in result.fetchall()}
        if "polygons" not in cols:
            await conn.execute(text("ALTER TABLE projects ADD COLUMN polygons TEXT DEFAULT '[]'"))


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session
