"""NEXUS domain model — implements PRD §37 (Database Tables)."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (JSON, Boolean, DateTime, Float, ForeignKey, Integer,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


# --------------------------------------------------------------------------- #
class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), default="Developer")
    password_hash: Mapped[str] = mapped_column(String(255))
    avatar_color: Mapped[str] = mapped_column(String(16), default="#6366f1")

    vault_salt: Mapped[str] = mapped_column(String(64))
    vault_canary: Mapped[str] = mapped_column(Text, default="")

    totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    projects: Mapped[list["Project"]] = relationship(back_populates="owner",
                                                     cascade="all, delete-orphan")
    workspace: Mapped["Workspace"] = relationship(back_populates="owner",
                                                  uselist=False,
                                                  cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)


# --------------------------------------------------------------------------- #
class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    workspace_id: Mapped[int | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"),
                                                     nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), default="Application")
    framework: Mapped[str] = mapped_column(String(80), default="")
    language: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(32), default="Planning", index=True)
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    icon: Mapped[str] = mapped_column(String(16), default="rocket")
    thumbnail: Mapped[str | None] = mapped_column(Text, nullable=True)
    tags: Mapped[list] = mapped_column(JSON, default=list)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    collection: Mapped[str] = mapped_column(String(80), default="")
    last_opened: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    owner: Mapped[User] = relationship(back_populates="projects")
    workspace: Mapped["Workspace"] = relationship(back_populates="projects")
    folders: Mapped[list["Folder"]] = relationship(cascade="all, delete-orphan")
    files: Mapped[list["File"]] = relationship(cascade="all, delete-orphan")
    project_files: Mapped[list["ProjectFile"]] = relationship(back_populates="project",
                                                              cascade="all, delete-orphan")


class Workspace(Base, TimestampMixin):
    __tablename__ = "workspaces"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), default="Workspace")
    description: Mapped[str] = mapped_column(Text, default="")
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    icon: Mapped[str] = mapped_column(String(24), default="layers")
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    owner: Mapped[User] = relationship(back_populates="workspace")
    projects: Mapped[list["Project"]] = relationship(back_populates="workspace",
                                                     cascade="all, delete-orphan")


class Folder(Base, TimestampMixin):
    __tablename__ = "folders"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="CASCADE"),
                                                  nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    path: Mapped[str] = mapped_column(String(1024), default="/", index=True)
    color: Mapped[str] = mapped_column(String(16), default="")
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class File(Base, TimestampMixin):
    __tablename__ = "files"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"),
                                                  nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    path: Mapped[str] = mapped_column(String(1024), default="/", index=True)
    extension: Mapped[str] = mapped_column(String(24), default="")
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    kind: Mapped[str] = mapped_column(String(24), default="file")   # text|image|video|doc|archive|binary
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="", index=True)
    blob_key: Mapped[str] = mapped_column(String(128), default="")
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)          # width/height, annotations…


class FileRevision(Base):
    """Per-file version history powering the Compare Versions view (§13)."""
    __tablename__ = "file_revisions"
    id: Mapped[int] = mapped_column(primary_key=True)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer, default=1)
    blob_key: Mapped[str] = mapped_column(String(128), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    sha256: Mapped[str] = mapped_column(String(64), default="")
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Snapshot(Base):
    __tablename__ = "snapshots"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(120), default="")
    size: Mapped[int] = mapped_column(Integer, default=0)
    file_count: Mapped[int] = mapped_column(Integer, default=0)
    archive_key: Mapped[str] = mapped_column(String(160), default="")
    manifest: Mapped[dict] = mapped_column(JSON, default=dict)
    kind: Mapped[str] = mapped_column(String(24), default="manual")  # manual|hourly|daily|weekly
    status: Mapped[str] = mapped_column(String(24), default="complete")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Task(Base, TimestampMixin):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"),
                                                  nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(24), default="Todo", index=True)
    priority: Mapped[str] = mapped_column(String(16), default="Medium", index=True)
    deadline: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    reminder: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    progress: Mapped[int] = mapped_column(Integer, default=0)
    labels: Mapped[list] = mapped_column(JSON, default=list)
    depends_on: Mapped[list] = mapped_column(JSON, default=list)
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    order_index: Mapped[int] = mapped_column(Integer, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Note(Base, TimestampMixin):
    __tablename__ = "notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"),
                                                   nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), default="Untitled note")
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(80), default="General")
    doc_type: Mapped[str] = mapped_column(String(40), default="note", index=True)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    checklist: Mapped[list] = mapped_column(JSON, default=list)


class Secret(Base, TimestampMixin):
    __tablename__ = "secrets"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"),
                                                   nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    kind: Mapped[str] = mapped_column(String(48), default="API Key")
    environment: Mapped[str] = mapped_column(String(32), default="development")
    ciphertext: Mapped[str] = mapped_column(Text)
    hint: Mapped[str] = mapped_column(String(48), default="")
    note: Mapped[str] = mapped_column(String(255), default="")
    last_accessed: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    access_count: Mapped[int] = mapped_column(Integer, default=0)


class VaultAudit(Base):
    __tablename__ = "vault_audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    secret_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    secret_name: Mapped[str] = mapped_column(String(160), default="")
    action: Mapped[str] = mapped_column(String(40))
    ip: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ApiEntry(Base, TimestampMixin):
    __tablename__ = "apis"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    collection: Mapped[str] = mapped_column(String(120), default="Default")
    name: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16), default="REST")     # REST | GraphQL
    method: Mapped[str] = mapped_column(String(10), default="GET")
    url: Mapped[str] = mapped_column(Text, default="")
    headers: Mapped[dict] = mapped_column(JSON, default=dict)
    body: Mapped[str] = mapped_column(Text, default="")
    auth: Mapped[dict] = mapped_column(JSON, default=dict)
    variables: Mapped[dict] = mapped_column(JSON, default=dict)
    last_response: Mapped[dict] = mapped_column(JSON, default=dict)
    order_index: Mapped[int] = mapped_column(Integer, default=0)


class DatabaseConnection(Base, TimestampMixin):
    __tablename__ = "db_connections"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    provider: Mapped[str] = mapped_column(String(40), default="PostgreSQL")
    host: Mapped[str] = mapped_column(String(255), default="localhost")
    port: Mapped[int] = mapped_column(Integer, default=5432)
    username: Mapped[str] = mapped_column(String(120), default="")
    password_secret_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    database: Mapped[str] = mapped_column(String(160), default="")
    schema_json: Mapped[list] = mapped_column(JSON, default=list)
    backups: Mapped[list] = mapped_column(JSON, default=list)
    last_test: Mapped[dict] = mapped_column(JSON, default=dict)


class Deployment(Base, TimestampMixin):
    __tablename__ = "deployments"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    environment: Mapped[str] = mapped_column(String(24), default="production")
    provider: Mapped[str] = mapped_column(String(40), default="Vercel")
    url: Mapped[str] = mapped_column(Text, default="")
    commit: Mapped[str] = mapped_column(String(80), default="")
    status: Mapped[str] = mapped_column(String(24), default="success")
    duration_s: Mapped[float] = mapped_column(Float, default=0)
    logs: Mapped[str] = mapped_column(Text, default="")
    env_vars: Mapped[dict] = mapped_column(JSON, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Template(Base, TimestampMixin):
    __tablename__ = "templates"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"),
                                                nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(16), default="package")
    color: Mapped[str] = mapped_column(String(16), default="#6366f1")
    language: Mapped[str] = mapped_column(String(80), default="")
    framework: Mapped[str] = mapped_column(String(80), default="")
    category: Mapped[str] = mapped_column(String(80), default="Application")
    builtin: Mapped[bool] = mapped_column(Boolean, default=False)
    uses: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)   # files, folders, tasks, docs


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    level: Mapped[str] = mapped_column(String(16), default="info")   # info|success|warning|error
    icon: Mapped[str] = mapped_column(String(24), default="bell")
    link: Mapped[str] = mapped_column(String(255), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"),
                                                   nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    target: Mapped[str] = mapped_column(String(255), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str] = mapped_column(String(24), default="activity")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Setting(Base):
    __tablename__ = "settings"
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_settings_user_key"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    key: Mapped[str] = mapped_column(String(80))
    value: Mapped[dict] = mapped_column(JSON, default=dict)


Settings = Setting


class FileBlob(Base, TimestampMixin):
    __tablename__ = "file_blobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    sha256: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    storage_key: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    size: Mapped[int] = mapped_column(Integer, default=0, index=True)
    mime: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    extension: Mapped[str] = mapped_column(String(24), default="", index=True)
    kind: Mapped[str] = mapped_column(String(24), default="binary", index=True)
    language: Mapped[str] = mapped_column(String(32), default="text")
    reference_count: Mapped[int] = mapped_column(Integer, default=0, index=True)
    blob_metadata: Mapped[dict] = mapped_column("metadata", JSON, default=dict)

    project_files: Mapped[list["ProjectFile"]] = relationship(back_populates="blob",
                                                              cascade="all, delete-orphan")


class ProjectFile(Base, TimestampMixin):
    __tablename__ = "project_files"
    id: Mapped[int] = mapped_column(primary_key=True)
    workspace_id: Mapped[int | None] = mapped_column(ForeignKey("workspaces.id", ondelete="CASCADE"),
                                                     nullable=True, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id", ondelete="SET NULL"),
                                                  nullable=True, index=True)
    blob_id: Mapped[int] = mapped_column(ForeignKey("file_blobs.id", ondelete="RESTRICT"), index=True)
    filename: Mapped[str] = mapped_column(String(255), index=True)
    path: Mapped[str] = mapped_column(String(1024), default="/", index=True)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"),
                                                    nullable=True, index=True)
    version: Mapped[int] = mapped_column(Integer, default=1, index=True)
    favorite: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    blob: Mapped[FileBlob] = relationship(back_populates="project_files")
    project: Mapped[Project] = relationship(back_populates="project_files")
    folder: Mapped[Folder | None] = relationship()


class APICollection(Base, TimestampMixin):
    __tablename__ = "api_collections"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    items: Mapped[list] = mapped_column(JSON, default=list)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
