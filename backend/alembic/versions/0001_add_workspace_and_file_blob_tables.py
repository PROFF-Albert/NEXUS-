"""Add workspace, file blob and project file tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0001_add_workspace_and_file_blob_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspaces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False, server_default="Workspace"),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("color", sa.String(length=16), nullable=False, server_default="#6366f1"),
        sa.Column("icon", sa.String(length=24), nullable=False, server_default="layers"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("user_id"),
    )
    op.add_column("projects", sa.Column("workspace_id", sa.Integer(), nullable=True))
    op.create_index("ix_projects_workspace_id", "projects", ["workspace_id"])
    op.create_foreign_key("fk_projects_workspace_id_workspaces", "projects", "workspaces",
                          ["workspace_id"], ["id"], ondelete="CASCADE")

    op.create_table(
        "file_blobs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("storage_key", sa.String(length=255), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("mime", sa.String(length=120), nullable=False, server_default="application/octet-stream"),
        sa.Column("extension", sa.String(length=24), nullable=False, server_default=""),
        sa.Column("kind", sa.String(length=24), nullable=False, server_default="binary"),
        sa.Column("language", sa.String(length=32), nullable=False, server_default="text"),
        sa.Column("reference_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_file_blobs_sha256", "file_blobs", ["sha256"], unique=True)
    op.create_index("ix_file_blobs_storage_key", "file_blobs", ["storage_key"], unique=True)

    op.create_table(
        "project_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("workspace_id", sa.Integer(), nullable=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("folder_id", sa.Integer(), sa.ForeignKey("folders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("blob_id", sa.Integer(), sa.ForeignKey("file_blobs.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("path", sa.String(length=1024), nullable=False, server_default="/"),
        sa.Column("uploaded_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_project_files_project_id", "project_files", ["project_id"])
    op.create_index("ix_project_files_folder_id", "project_files", ["folder_id"])
    op.create_index("ix_project_files_blob_id", "project_files", ["blob_id"])
    op.create_index("ix_project_files_workspace_id", "project_files", ["workspace_id"])
    op.create_index("ix_project_files_filename", "project_files", ["filename"])

    op.create_table(
        "api_collections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("items", sa.JSON(), nullable=False, server_default=sa.text("'[]'::json")),
        sa.Column("meta", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_api_collections_project_id", "api_collections", ["project_id"])


def downgrade() -> None:
    op.drop_index("ix_api_collections_project_id", table_name="api_collections")
    op.drop_table("api_collections")
    op.drop_index("ix_project_files_filename", table_name="project_files")
    op.drop_index("ix_project_files_workspace_id", table_name="project_files")
    op.drop_index("ix_project_files_blob_id", table_name="project_files")
    op.drop_index("ix_project_files_folder_id", table_name="project_files")
    op.drop_index("ix_project_files_project_id", table_name="project_files")
    op.drop_table("project_files")
    op.drop_index("ix_file_blobs_storage_key", table_name="file_blobs")
    op.drop_index("ix_file_blobs_sha256", table_name="file_blobs")
    op.drop_table("file_blobs")
    op.drop_constraint("fk_projects_workspace_id_workspaces", "projects", type_="foreignkey")
    op.drop_index("ix_projects_workspace_id", table_name="projects")
    op.drop_column("projects", "workspace_id")
    op.drop_table("workspaces")
