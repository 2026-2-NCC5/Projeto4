from __future__ import annotations

from datetime import UTC, datetime

from pydantic import BaseModel, ConfigDict, Field


class DiscoveredLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(max_length=300)
    url: str = Field(max_length=2048)
    relation: str = "link"
    in_scope: bool = True
    read_only_candidate: bool = True


class PortalTable(BaseModel):
    model_config = ConfigDict(extra="forbid")
    headers: list[str] = Field(default_factory=list, max_length=100)
    rows: list[list[str]] = Field(default_factory=list, max_length=500)


class FormField(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(max_length=300)
    field_type: str = Field(max_length=40)
    required: bool = False
    name: str | None = Field(default=None, max_length=200)


class FormInventory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(max_length=300)
    fields: list[FormField] = Field(default_factory=list, max_length=100)


class PortalRoute(BaseModel):
    model_config = ConfigDict(extra="forbid")
    route_id: str
    title: str
    route: str
    parent_route: str | None = None
    breadcrumbs: list[str] = Field(default_factory=list)
    state_signature: str
    page_kind: str = "unknown"
    visited_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    access_status: str = "accessible"
    result: str = "extracted"
    depth: int = 0
    links: list[DiscoveredLink] = Field(default_factory=list)
    tabs: list[str] = Field(default_factory=list)
    documents: list[DiscoveredLink] = Field(default_factory=list)
    tables: list[PortalTable] = Field(default_factory=list)
    forms: list[FormInventory] = Field(default_factory=list)
    text: str = ""
    warnings: list[str] = Field(default_factory=list)


class PortalInventory(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source: str = "fecap_totvs_portal"
    session_id: str
    started_at: datetime
    finished_at: datetime | None = None
    auth_status: str
    parser_version: str = "0.1.0"
    scrapling_version: str
    pages_discovered: int = 0
    pages_visited: int = 0
    routes: list[PortalRoute] = Field(default_factory=list)
    errors: list[dict[str, str]] = Field(default_factory=list)


class SyncPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str
    started_at: datetime
    finished_at: datetime
    auth_status: str
    scrapling_version: str
    parser_version: str
    routes: list[PortalRoute] = Field(max_length=300)
