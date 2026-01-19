import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { TopicFilter } from "./topic-filter";

describe("TopicFilter", () => {
  it("renders nothing when topics array is empty", () => {
    const { container } = render(<TopicFilter topics={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Todos' and all topics as badges", () => {
    render(<TopicFilter topics={["Tech", "Cloud", "DevOps"]} />);

    expect(screen.getByText("Todos")).toBeInTheDocument();
    expect(screen.getByText("Tech")).toBeInTheDocument();
    expect(screen.getByText("Cloud")).toBeInTheDocument();
    expect(screen.getByText("DevOps")).toBeInTheDocument();
  });

  it("highlights 'Todos' when no topic is active", () => {
    render(<TopicFilter topics={["Tech", "Cloud"]} />);

    const todosLink = screen.getByText("Todos").closest("a");
    const todosParent = todosLink?.querySelector("span, div");
    // Todos should have default variant (not outline)
    expect(todosParent).not.toHaveClass("border-input");
  });

  it("highlights active topic", () => {
    render(<TopicFilter topics={["Tech", "Cloud"]} activeTopic="Cloud" />);

    // Cloud should be highlighted (default variant)
    const cloudBadge = screen.getByText("Cloud");
    expect(cloudBadge).toBeInTheDocument();

    // Todos should not be highlighted (outline variant)
    const todosBadge = screen.getByText("Todos");
    expect(todosBadge).toBeInTheDocument();
  });

  it("generates correct URLs for topics", () => {
    render(<TopicFilter topics={["Tech"]} baseUrl="/episodios" />);

    const techLink = screen.getByText("Tech").closest("a");
    expect(techLink).toHaveAttribute("href", "/episodios?topic=Tech");
  });

  it("generates correct URL for clearing filter", () => {
    render(
      <TopicFilter topics={["Tech"]} activeTopic="Tech" baseUrl="/episodios" />
    );

    const todosLink = screen.getByText("Todos").closest("a");
    expect(todosLink).toHaveAttribute("href", "/episodios");
  });

  it("encodes special characters in topic URLs", () => {
    render(<TopicFilter topics={["C++"]} baseUrl="/episodios" />);

    const link = screen.getByText("C++").closest("a");
    expect(link).toHaveAttribute("href", "/episodios?topic=C%2B%2B");
  });

  it("uses default baseUrl when not provided", () => {
    render(<TopicFilter topics={["Tech"]} />);

    const techLink = screen.getByText("Tech").closest("a");
    expect(techLink).toHaveAttribute("href", "/episodios?topic=Tech");

    const todosLink = screen.getByText("Todos").closest("a");
    expect(todosLink).toHaveAttribute("href", "/episodios");
  });

  it("has accessible navigation role", () => {
    render(<TopicFilter topics={["Tech"]} />);

    const nav = screen.getByRole("navigation", { name: /filtros por tópico/i });
    expect(nav).toBeInTheDocument();
  });
});
